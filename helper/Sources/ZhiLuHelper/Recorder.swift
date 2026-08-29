import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreGraphics
import CoreMedia
import CoreImage
import AppKit

/// 基于 ScreenCaptureKit 的录屏器：
/// - 视频不含系统鼠标（showsCursor = false），鼠标在导出阶段用自定义样式重绘
/// - 会把知录自己的窗口（悬浮控制条、选区遮罩、主窗口）排除在画面之外
/// - 以 120Hz 采样鼠标位置、左键状态与手动缩放级别，写入轨迹 json
/// - 支持整屏 / 自定义选区 / 指定窗口三种录制范围
/// - 支持暂停 / 继续（暂停期间不写入画面、声音、鼠标轨迹，并把时间戳前移保证成片连贯）
/// - 手动放大：⌃⌥ + 滚轮（或 ⌃⌥ + ↑↓）连续调节；点击开关模式下点一下放大、再点一下缩回
/// - 录制中持续输出实时预览帧，供悬浮控制条展示放大效果
@available(macOS 13.0, *)
final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {

    private let req: RecordRequest
    private var stream: SCStream?
    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var audioInput: AVAssetWriterInput?

    private var sessionStarted = false
    private var startHostTime: Double = 0
    private var finished = false

    private var track: MouseTrack
    private var mouseTimer: DispatchSourceTimer?
    private let trackQueue = DispatchQueue(label: "zhilu.track")
    private let videoQueue = DispatchQueue(label: "zhilu.video")
    private let audioQueue = DispatchQueue(label: "zhilu.audio")

    // 暂停 / 继续
    private let stateLock = NSLock()
    private var isPaused = false
    private var pauseAccumSeconds: Double = 0
    private var pauseWallStart: Double = 0

    // 手动缩放（快捷键 + 滚轮 / 点击开关）
    private let manualLock = NSLock()
    private var manualZoom: Double = 1.0
    private var xDownSince: Double = -1
    /// 这次 X 按下的瞬间，A 是不是也按着。
    /// 决定松手时是「停在当前倍数」还是「归位到 1.0×」，
    /// 而且只在按下那一刻判定一次——中途松开 A 不会让它突然变成归位手势。
    private var xStartedWithA = false
    private var zDownSince: Double = -1
    private var lastZoomEmit: Double = 0

    // 实时预览
    private let previewLock = NSLock()
    private var lastPixelBuffer: CVPixelBuffer?
    private var previewTimer: DispatchSourceTimer?
    private let previewCI = CIContext(options: [.useSoftwareRenderer: false])
    private var liveFocusX = 0.5, liveFocusY = 0.5
    private var liveZoom = 1.0
    private var lastRawX = 0.5, lastRawY = 0.5
    private var prevRawX = 0.5, prevRawY = 0.5
    private var stillSince: Double = 0
    private var autoZoomUntil: Double = -1
    private var prevDown = false

    // 麦克风
    private var captureSession: AVCaptureSession?
    private var micDelegate: MicDelegate?

    init(req: RecordRequest) {
        self.req = req
        self.track = MouseTrack(width: 0, height: 0, originX: 0, originY: 0, samples: [])
        super.init()
    }

    // MARK: - 启动

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

        // 把知录自己的窗口排除掉，否则悬浮控制条会被录进画面
        let ownApps = content.applications.filter { app in
            let bid = app.bundleIdentifier
            return bid.hasPrefix("com.aguang.agrec")
                || bid.hasPrefix("com.zhilu")
                || app.applicationName.contains("知录")
                || app.applicationName.lowercased().contains("zhilu")
                || app.applicationName.lowercased().contains("agrec")
        }

        let filter: SCContentFilter
        var outW = 0, outH = 0
        var useSourceRect: CGRect? = nil

        if req.mode == "window" {
            guard let target = content.windows.first(where: { $0.windowID == req.windowID }) else {
                Emit.fail("找不到要录制的窗口，它可能已经关闭，请重新选择")
            }
            filter = SCContentFilter(desktopIndependentWindow: target)
            let f = target.frame
            track.width = f.width
            track.height = f.height
            track.originX = f.origin.x
            track.originY = f.origin.y
            let aspect = f.width / max(f.height, 1)
            outH = req.height
            outW = Int((Double(outH) * aspect).rounded())
        } else {
            guard let display = content.displays.first(where: { $0.displayID == req.displayID })
                    ?? content.displays.first else {
                Emit.fail("找不到可用的显示器，请检查「屏幕录制」权限是否已开启")
            }
            filter = SCContentFilter(display: display,
                                     excludingApplications: ownApps,
                                     exceptingWindows: [])
            let bounds = CGDisplayBounds(display.displayID)

            if req.mode == "area" && req.areaWidth > 4 && req.areaHeight > 4 {
                track.width = req.areaWidth
                track.height = req.areaHeight
                track.originX = bounds.origin.x + req.areaX
                track.originY = bounds.origin.y + req.areaY
                let aspect = req.areaWidth / max(req.areaHeight, 1)
                outH = req.height
                outW = Int((Double(outH) * aspect).rounded())
                useSourceRect = CGRect(x: req.areaX, y: req.areaY, width: req.areaWidth, height: req.areaHeight)
            } else {
                track.width = bounds.width
                track.height = bounds.height
                track.originX = bounds.origin.x
                track.originY = bounds.origin.y
                let aspect = bounds.width / max(bounds.height, 1)
                outH = req.height
                outW = Int((Double(outH) * aspect).rounded())
            }
        }
        if outW % 2 != 0 { outW += 1 }
        if outH % 2 != 0 { outH += 1 }

        try setupWriter(width: outW, height: outH)

        let config = SCStreamConfiguration()
        config.width = outW
        config.height = outH
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(req.fps))
        config.queueDepth = 6
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.showsCursor = false            // 关键：不录系统鼠标
        config.scalesToFit = true
        if let rect = useSourceRect { config.sourceRect = rect }
        if req.audioSource == "system" {
            config.capturesAudio = true
            config.sampleRate = 48000
            config.channelCount = 2
            config.excludesCurrentProcessAudio = true
        }

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: videoQueue)
        if req.audioSource == "system" {
            try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        }
        self.stream = stream

        if req.audioSource == "mic" { try startMicrophone() }

        try await stream.startCapture()
        startHostTime = CACurrentMediaTime()
        startMouseTracking()
        startPreviewLoop()
        Emit.ok(["stage": "started", "width": outW, "height": outH])
    }

    // MARK: - AVAssetWriter

    private func setupWriter(width: Int, height: Int) throws {
        let url = URL(fileURLWithPath: req.output)
        try? FileManager.default.removeItem(at: url)
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)

        let codec: AVVideoCodecType = (req.codec == "hevc") ? .hevc : .h264
        var props: [String: Any] = [
            AVVideoAverageBitRateKey: Int(req.bitrateMbps * 1_000_000),
            AVVideoExpectedSourceFrameRateKey: req.fps,
            AVVideoMaxKeyFrameIntervalKey: req.fps * 2,
            AVVideoAllowFrameReorderingKey: false
        ]
        if codec == .h264 {
            props[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
        }
        let settings: [String: Any] = [
            AVVideoCodecKey: codec,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: props
        ]
        let vin = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        vin.expectsMediaDataInRealTime = true
        if writer.canAdd(vin) { writer.add(vin) }
        self.videoInput = vin

        if req.audioSource != "none" {
            let asettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 192_000
            ]
            let ain = AVAssetWriterInput(mediaType: .audio, outputSettings: asettings)
            ain.expectsMediaDataInRealTime = true
            if writer.canAdd(ain) { writer.add(ain) }
            self.audioInput = ain
        }

        guard writer.startWriting() else {
            Emit.fail("无法开始写入视频文件：\(writer.error?.localizedDescription ?? "未知错误")")
        }
        self.writer = writer
    }

    // MARK: - 暂停 / 继续

    func pause() {
        stateLock.lock()
        if !isPaused { isPaused = true; pauseWallStart = CACurrentMediaTime() }
        stateLock.unlock()
        Emit.line(["type": "paused"])
    }

    func resume() {
        stateLock.lock()
        if isPaused { isPaused = false; pauseAccumSeconds += CACurrentMediaTime() - pauseWallStart }
        stateLock.unlock()
        Emit.line(["type": "resumed"])
    }

    private func currentPauseState() -> (paused: Bool, accum: Double) {
        stateLock.lock()
        defer { stateLock.unlock() }
        return (isPaused, pauseAccumSeconds)
    }

    /// 把样本缓冲区的时间戳整体前移，抹掉暂停造成的时间空洞
    private func shiftedBuffer(_ sb: CMSampleBuffer, bySeconds seconds: Double) -> CMSampleBuffer? {
        guard seconds > 0.0005 else { return sb }
        let shift = CMTime(seconds: seconds, preferredTimescale: 600)
        var count: CMItemCount = 0
        CMSampleBufferGetSampleTimingInfoArray(sb, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count)
        guard count > 0 else { return sb }
        var timings = [CMSampleTimingInfo](
            repeating: CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .invalid, decodeTimeStamp: .invalid),
            count: count)
        guard CMSampleBufferGetSampleTimingInfoArray(sb, entryCount: count, arrayToFill: &timings, entriesNeededOut: nil) == noErr else {
            return sb
        }
        for i in 0..<timings.count {
            if timings[i].presentationTimeStamp.isValid {
                timings[i].presentationTimeStamp = timings[i].presentationTimeStamp - shift
            }
            if timings[i].decodeTimeStamp.isValid {
                timings[i].decodeTimeStamp = timings[i].decodeTimeStamp - shift
            }
        }
        var out: CMSampleBuffer?
        CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: sb,
                                              sampleTimingEntryCount: count, sampleTimingArray: &timings,
                                              sampleBufferOut: &out)
        return out ?? sb
    }

    // MARK: - 手动缩放

    private func currentManualZoom() -> Double {
        manualLock.lock(); defer { manualLock.unlock() }
        return manualZoom
    }

    private func setManualZoom(_ v: Double, force: Bool = false) {
        manualLock.lock()
        let clamped = min(max(v, 1.0), 4.0)
        let changed = abs(clamped - manualZoom) > 0.0005
        manualZoom = clamped
        manualLock.unlock()
        guard changed else { return }
        // 轮询是 120Hz，向前端汇报限到 ~30Hz 就够顺了
        let now = CACurrentMediaTime()
        if force || now - lastZoomEmit > 0.033 || clamped <= 1.0001 {
            lastZoomEmit = now
            Emit.line(["type": "manualZoom", "value": clamped])
        }
    }

    /// 以 120Hz 轮询键盘状态实现手动缩放。
    /// 走的是 CGEventSource.keyState，和点击检测同一套 API，不需要任何额外授权。
    ///
    ///   按住 A + Z        逐步放大，松开就停在当前倍数
    ///   按住 A + X        缓慢缩小，松开就停在当前倍数
    ///   单独轻点 X        一步归位到 1.0×（A 不能按着）
    ///
    /// A、Z、X 都在左手同一片区域，右手不用离开鼠标；
    /// 必须先按住 A 才生效，所以录制中在输入框里打字不会误触发。
    /// 不做操作时当前倍数一直保持，画面持续跟随鼠标移动。
    private func pollManualHotkeys() {
        let src = CGEventSourceStateID.combinedSessionState
        let now = CACurrentMediaTime()
        let aDown = CGEventSource.keyState(src, key: CGKeyCode(req.hotkeyA))
        let zDown = CGEventSource.keyState(src, key: CGKeyCode(req.hotkeyZ))
        let xDown = CGEventSource.keyState(src, key: CGKeyCode(req.hotkeyX))

        // ---- X 键：两种手势靠「按下那一刻 A 在不在」区分，不靠按住时长 ----
        //
        // 之前的写法是「按住多久」来分轻点/长按（tapWindow = 0.22 秒），
        // 结果两条路都通向 1.0×：短于 0.22 秒 → 判定为轻点，直接归位；
        // 长于 0.22 秒 → 缩小速度又快到 0.5 秒就见底。
        // 中间只剩下不到 0.3 秒的窗口能停在半路，手上根本抓不住，
        // 表现出来就是「A+X 不管按多久都是直接缩回 1×」。
        //
        // 现在改成按下瞬间就定性，两个手势彻底分家，没有任何时间窗口的竞争：
        //   A + X（按下时 A 按着）  持续缓慢缩小，松开 X 就停在当前倍数
        //   单独按 X（A 没按）      松开时一步归位到 1.0×
        if xDown {
            if xDownSince < 0 {
                xDownSince = now
                xStartedWithA = aDown          // 只在按下这一帧判定一次
            }
            // 只有「A+X」这条手势在按住期间持续缩小；
            // 单独按 X 期间什么都不做，等松手再一步归位。
            if xStartedWithA {
                setManualZoom(currentManualZoom() - Recorder.stepOut(now - xDownSince))
            }
            return
        } else if xDownSince >= 0 {
            let startedWithA = xStartedWithA
            xDownSince = -1
            xStartedWithA = false
            // 松手：A+X 停在当前倍数（什么都不做）；单独 X 一步归位。
            if !startedWithA {
                setManualZoom(1.0, force: true)
                return
            }
        }

        // ---- Z 键：按住 A+Z 逐步放大 ----
        if aDown && zDown {
            if zDownSince < 0 { zDownSince = now }
            setManualZoom(currentManualZoom() + Recorder.stepIn(now - zDownSince))
        } else {
            zDownSince = -1
        }
    }

    /// 放大：慢一点，方便对准目标。按住越久越快。
    /// 轮询是 120Hz，所以步进乘以 120 就是每秒变化的倍率。
    static func stepIn(_ held: Double) -> Double {
        let ramp = min(max(held, 0), 1.5) / 1.5          // 0 → 1
        return 0.005 + ramp * 0.010                       // 每秒 0.6× → 1.8×
    }

    /// 缩小：速度要跟放大同一个量级，手上才控得住停在半路。
    /// 之前是每秒 1.44×→3.84×，从 1.8× 半秒就见底，等于没有中间状态可停。
    /// 想一步到底不用按住等——松开 A 单独点一下 X 就直接归位。
    static func stepOut(_ held: Double) -> Double {
        let ramp = min(max(held, 0), 1.2) / 1.2
        return 0.0033 + ramp * 0.0067                     // 每秒 0.4× → 1.2×
    }

    // MARK: - 鼠标采样

    private func startMouseTracking() {
        let timer = DispatchSource.makeTimerSource(queue: trackQueue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(8))   // ~120Hz
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            let (paused, accum) = self.currentPauseState()
            guard let loc = CGEvent(source: nil)?.location else { return }
            let down = CGEventSource.buttonState(.combinedSessionState, button: .left)
            let now = CACurrentMediaTime()

            if self.track.width > 0, self.track.height > 0 {
                self.prevRawX = self.lastRawX
                self.prevRawY = self.lastRawY
                self.lastRawX = min(max((loc.x - self.track.originX) / self.track.width, 0), 1)
                self.lastRawY = min(max((loc.y - self.track.originY) / self.track.height, 0), 1)
                if hypot(self.lastRawX - self.prevRawX, self.lastRawY - self.prevRawY) > 0.0035 {
                    self.stillSince = now
                }
            }

            let clicked = down && !self.prevDown
            self.prevDown = down

            if self.req.trigger == "manual" { self.pollManualHotkeys() }

            if clicked {
                switch self.req.trigger {
                case "clickToggle":
                    // 点一下放大，再点一下缩回
                    self.setManualZoom(self.currentManualZoom() > 1.05 ? 1.0 : self.req.zoomScale)
                case "click":
                    self.autoZoomUntil = now + 1.6
                default:
                    break
                }
            }

            guard !paused else { return }
            let t = now - self.startHostTime - accum
            self.track.samples.append(MouseSample(
                t: t,
                x: loc.x - self.track.originX,
                y: loc.y - self.track.originY,
                down: down,
                z: self.currentManualZoom()))
        }
        timer.resume()
        mouseTimer = timer
    }

    // MARK: - 实时预览（悬浮控制条用，不影响最终录制画质）

    private func startPreviewLoop() {
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "zhilu.preview"))
        timer.schedule(deadline: .now() + 0.25, repeating: .milliseconds(80))   // ~12fps
        timer.setEventHandler { [weak self] in self?.emitPreviewFrame() }
        timer.resume()
        previewTimer = timer
    }

    /// 与导出阶段一致的取景逻辑：先算目标缩放，再平滑逼近，避免预览一跳一跳
    private func targetZoomNow() -> Double {
        let manual = currentManualZoom()
        if manual > 1.05 { return manual }
        let now = CACurrentMediaTime()
        if req.trigger == "click" && now < autoZoomUntil { return req.zoomScale }
        if req.trigger == "dwell" && now - stillSince > req.dwellTime { return req.zoomScale }
        return 1.0
    }

    private func emitPreviewFrame() {
        previewLock.lock()
        let pb = lastPixelBuffer
        previewLock.unlock()
        guard let pb else { return }

        let target = targetZoomNow()
        liveZoom += (target - liveZoom) * 0.16
        liveFocusX += (lastRawX - liveFocusX) * 0.14
        liveFocusY += (lastRawY - liveFocusY) * 0.14

        let full = CIImage(cvPixelBuffer: pb)
        let w = full.extent.width, h = full.extent.height
        guard w > 1, h > 1 else { return }
        let z = max(liveZoom, 1.0)
        let cropW = w / z, cropH = h / z
        var cx = CGFloat(liveFocusX) * w - cropW / 2
        var cyTop = CGFloat(liveFocusY) * h - cropH / 2
        cx = min(max(cx, 0), max(w - cropW, 0))
        cyTop = min(max(cyTop, 0), max(h - cropH, 0))
        let cyBottom = h - cyTop - cropH

        let cropped = full.cropped(to: CGRect(x: cx, y: cyBottom, width: cropW, height: cropH))
        let scaleDown = min(640 / max(cropW, 1), 1)
        let thumb = cropped.transformed(by: CGAffineTransform(translationX: -cx, y: -cyBottom)
            .concatenating(CGAffineTransform(scaleX: scaleDown, y: scaleDown)))

        guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let data = previewCI.jpegRepresentation(of: thumb, colorSpace: cs) else { return }
        Emit.line(["type": "preview", "image": data.base64EncodedString(), "zoom": liveZoom])
    }

    // MARK: - 麦克风

    private func startMicrophone() throws {
        guard let device = AVCaptureDevice.default(for: .audio) else {
            Emit.fail("找不到麦克风设备")
        }
        let session = AVCaptureSession()
        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else { Emit.fail("无法添加麦克风输入") }
        session.addInput(input)

        let output = AVCaptureAudioDataOutput()
        let delegate = MicDelegate { [weak self] sb in self?.appendAudio(sb) }
        output.setSampleBufferDelegate(delegate, queue: audioQueue)
        guard session.canAddOutput(output) else { Emit.fail("无法添加麦克风输出") }
        session.addOutput(output)

        session.startRunning()
        captureSession = session
        micDelegate = delegate
    }

    private func appendAudio(_ sb: CMSampleBuffer) {
        guard sessionStarted, !finished,
              let ain = audioInput, ain.isReadyForMoreMediaData else { return }
        ain.append(sb)
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard !finished, CMSampleBufferDataIsReady(sampleBuffer) else { return }
        let (paused, accum) = currentPauseState()

        switch type {
        case .screen:
            if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
               let raw = attachments.first?[.status] as? Int,
               let status = SCFrameStatus(rawValue: raw), status != .complete {
                return
            }
            if let pb = CMSampleBufferGetImageBuffer(sampleBuffer) {
                previewLock.lock(); lastPixelBuffer = pb; previewLock.unlock()
            }
            guard !paused else { return }
            guard let writer, let vin = videoInput else { return }
            guard let shifted = shiftedBuffer(sampleBuffer, bySeconds: accum) else { return }
            if !sessionStarted {
                writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(shifted))
                sessionStarted = true
            }
            if vin.isReadyForMoreMediaData { vin.append(shifted) }

        case .audio:
            guard !paused else { return }
            if let shifted = shiftedBuffer(sampleBuffer, bySeconds: accum) {
                appendAudio(shifted)
            }

        default:
            break
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        Emit.line(["type": "streamError", "message": error.localizedDescription])
    }

    // MARK: - 结束

    func stop() async {
        guard !finished else { return }
        finished = true
        mouseTimer?.cancel(); mouseTimer = nil
        previewTimer?.cancel(); previewTimer = nil
        captureSession?.stopRunning()
        try? await stream?.stopCapture()
        stream = nil

        // 预览用的最后一帧要主动放掉：4K 的 CVPixelBuffer 背后是一块 IOSurface，
        // 一帧就三十多 MB。不清空的话它会一直被这个对象扣着不还给系统。
        previewLock.lock()
        lastPixelBuffer = nil
        previewLock.unlock()

        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        if let writer {
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                writer.finishWriting { cont.resume() }
            }
        }

        var snapshot = MouseTrack(width: track.width, height: track.height,
                                  originX: track.originX, originY: track.originY, samples: [])
        trackQueue.sync { snapshot.samples = self.track.samples }
        if let data = try? JSONEncoder().encode(snapshot) {
            try? data.write(to: URL(fileURLWithPath: req.trackPath))
        }

        let duration = snapshot.samples.last?.t ?? 0
        Emit.ok(["stage": "finished", "output": req.output,
                 "track": req.trackPath, "duration": duration,
                 "samples": snapshot.samples.count])
    }
}

final class MicDelegate: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let handler: (CMSampleBuffer) -> Void
    init(handler: @escaping (CMSampleBuffer) -> Void) { self.handler = handler }
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        handler(sampleBuffer)
    }
}
