import Foundation
import AVFoundation
import CoreImage
import CoreMedia
import CoreVideo

/// 合成阶段共享的上下文（AVFoundation 会自行实例化 compositor，只能用共享单例传参）
final class ExportContext {
    static let shared = ExportContext()
    var timeline: Timeline?
    var trimStart: Double = 0
    var outputSize = CGSize(width: 1920, height: 1080)
    var sourceSize = CGSize(width: 1920, height: 1080)
    var cursorImage: CIImage?
    var cursorHotspot = CGPoint(x: 0.5, y: 0.5)
    var cursorBasePx: CGFloat = 32
    var cursorScaleWithZoom = true
    var rippleImage: CIImage?
    var rippleBasePx: CGFloat = 64
}

final class ZoomInstruction: NSObject, AVVideoCompositionInstructionProtocol {
    var timeRange: CMTimeRange
    var enablePostProcessing: Bool = false
    var containsTweening: Bool = true
    var requiredSourceTrackIDs: [NSValue]?
    var passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    init(timeRange: CMTimeRange, trackID: CMPersistentTrackID) {
        self.timeRange = timeRange
        self.requiredSourceTrackIDs = [NSNumber(value: trackID)]
        super.init()
    }
}

final class ZoomCompositor: NSObject, AVVideoCompositing {

    private let ciContext = CIContext(options: [.useSoftwareRenderer: false,
                                                .cacheIntermediates: false])
    private let queue = DispatchQueue(label: "zhilu.compositor")

    // AVVideoCompositing 这两个属性的类型在不同 SDK 里不一样：
    // Xcode 16（Swift 6 编译器）起是 [String: any Sendable]，此前是 [String: Any]。
    // 写死任何一种，都会在另一种 Xcode 上报「does not conform to protocol」。
    // 用编译器版本分支，两边都能编——这比把 CI 钉死在某个 Xcode 版本上更靠谱，
    // 否则别人拿旧 Xcode clone 下来照样编不过。
    #if compiler(>=6.0)
    var sourcePixelBufferAttributes: [String: any Sendable]? {
        [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA]]
    }
    var requiredPixelBufferAttributesForRenderContext: [String: any Sendable] {
        [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA]]
    }
    #else
    var sourcePixelBufferAttributes: [String: Any]? {
        [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA]]
    }
    var requiredPixelBufferAttributesForRenderContext: [String: Any] {
        [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA]]
    }
    #endif

    func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {}

    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        queue.async { [weak self] in
            guard let self else { return }
            autoreleasepool {
                guard let trackID = request.sourceTrackIDs.first?.int32Value,
                      let srcBuffer = request.sourceFrame(byTrackID: trackID),
                      let dst = request.renderContext.newPixelBuffer() else {
                    request.finish(with: NSError(domain: "zhilu", code: -1,
                                                 userInfo: [NSLocalizedDescriptionKey: "合成帧失败"]))
                    return
                }
                let ctx = ExportContext.shared
                let t = CMTimeGetSeconds(request.compositionTime) - ctx.trimStart
                let f = ctx.timeline?.frame(at: t)
                    ?? Timeline.Frame(zoom: 1, focusX: 0.5, focusY: 0.5,
                                      cursorX: 0.5, cursorY: 0.5, rippleScale: 0, rippleAlpha: 0)

                let image = self.compose(source: CIImage(cvPixelBuffer: srcBuffer), frame: f, ctx: ctx)
                self.ciContext.render(image, to: dst,
                                      bounds: CGRect(origin: .zero, size: ctx.outputSize),
                                      colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
                request.finish(withComposedVideoFrame: dst)
            }
        }
    }

    private func compose(source: CIImage, frame f: Timeline.Frame, ctx: ExportContext) -> CIImage {
        let srcW = ctx.sourceSize.width, srcH = ctx.sourceSize.height
        let outW = ctx.outputSize.width, outH = ctx.outputSize.height
        let z = CGFloat(max(f.zoom, 1.0))

        // 裁剪区域（源画面像素，左上原点）
        let cropW = srcW / z
        let cropH = srcH / z
        var cropX = CGFloat(f.focusX) * srcW - cropW / 2
        var cropYTop = CGFloat(f.focusY) * srcH - cropH / 2
        cropX = min(max(cropX, 0), max(srcW - cropW, 0))
        cropYTop = min(max(cropYTop, 0), max(srcH - cropH, 0))
        let cropYBottom = srcH - cropYTop - cropH     // CoreImage 是左下原点

        let kx = outW / cropW
        let ky = outH / cropH

        var image = source
            .cropped(to: CGRect(x: cropX, y: cropYBottom, width: cropW, height: cropH))
            .transformed(by: CGAffineTransform(translationX: -cropX, y: -cropYBottom)
                .concatenating(CGAffineTransform(scaleX: kx, y: ky)))

        // 鼠标位置 -> 输出坐标
        let mxSrc = CGFloat(f.cursorX) * srcW
        let mySrc = CGFloat(f.cursorY) * srcH
        let ox = (mxSrc - cropX) * kx
        let oyTop = (mySrc - cropYTop) * ky
        let oyBottom = outH - oyTop

        let zoomFactor = ctx.cursorScaleWithZoom ? z : 1.0

        // 点击水波纹（画在指针下面）
        if f.rippleAlpha > 0.001, let ripple = ctx.rippleImage {
            let size = ctx.rippleBasePx * CGFloat(f.rippleScale) * zoomFactor
            let ext = ripple.extent
            let s = size / max(ext.width, 1)
            let img = ripple
                .transformed(by: CGAffineTransform(scaleX: s, y: s))
                .applyingFilter("CIColorMatrix", parameters: [
                    "inputAVector": CIVector(x: 0, y: 0, z: 0, w: CGFloat(f.rippleAlpha))
                ])
                .transformed(by: CGAffineTransform(translationX: ox - size / 2,
                                                   y: oyBottom - size / 2))
            image = img.composited(over: image)
        }

        // 自定义鼠标指针
        if let cursor = ctx.cursorImage {
            let size = ctx.cursorBasePx * zoomFactor
            let ext = cursor.extent
            let s = size / max(ext.width, 1)
            let hx = ctx.cursorHotspot.x * size
            let hy = (1 - ctx.cursorHotspot.y) * size    // 图像热点用左上原点，这里翻到左下
            let img = cursor
                .transformed(by: CGAffineTransform(scaleX: s, y: s))
                .transformed(by: CGAffineTransform(translationX: ox - hx, y: oyBottom - hy))
            image = img.composited(over: image)
        }

        return image.cropped(to: CGRect(origin: .zero, size: ctx.outputSize))
    }
}

// MARK: - 导出流程

enum Exporter {

    static func run(_ req: ExportRequest) async {
        let asset = AVURLAsset(url: URL(fileURLWithPath: req.input))
        guard let videoTrack = try? await asset.loadTracks(withMediaType: .video).first else {
            Emit.fail("读取不到视频轨道：\(req.input)")
        }
        let assetDuration = CMTimeGetSeconds((try? await asset.load(.duration)) ?? .zero)
        let natural = (try? await videoTrack.load(.naturalSize)) ?? CGSize(width: 1920, height: 1080)

        let trimStart = max(0, req.trimStart)
        let trimEnd = (req.trimEnd > 0 ? min(req.trimEnd, assetDuration) : assetDuration)
        let duration = max(0.1, trimEnd - trimStart)

        // 输出尺寸对齐源画面比例
        let aspect = natural.width / max(natural.height, 1)
        var outH = req.height
        var outW = Int((Double(outH) * Double(aspect)).rounded())
        if outW % 2 != 0 { outW += 1 }
        if outH % 2 != 0 { outH += 1 }
        let outputSize = CGSize(width: outW, height: outH)

        // 准备共享上下文
        let ctx = ExportContext.shared
        ctx.timeline = Timeline(request: req, duration: duration)
        ctx.trimStart = trimStart
        ctx.outputSize = outputSize
        ctx.sourceSize = natural
        ctx.cursorScaleWithZoom = req.cursor.scaleWithZoom

        let cursorPx = 32.0 * req.cursor.size * (Double(outH) / 1080.0)
        ctx.cursorBasePx = CGFloat(cursorPx)
        ctx.rippleBasePx = CGFloat(cursorPx * 2.2)
        if let made = CursorRenderer.make(style: req.cursor, pixelSize: Int(max(cursorPx * 3, 64))) {
            ctx.cursorImage = CIImage(cgImage: made.image)
            ctx.cursorHotspot = made.hotspot
        } else {
            ctx.cursorImage = nil
        }
        if req.cursor.clickRipple, let r = CursorRenderer.ripple(color: req.cursor.color, pixelSize: 256) {
            ctx.rippleImage = CIImage(cgImage: r)
        } else {
            ctx.rippleImage = nil
        }

        // 视频合成描述
        let comp = AVMutableVideoComposition()
        comp.renderSize = outputSize
        comp.frameDuration = CMTime(value: 1, timescale: CMTimeScale(req.fps))
        comp.customVideoCompositorClass = ZoomCompositor.self
        let full = CMTimeRange(start: .zero, duration: CMTime(seconds: assetDuration, preferredTimescale: 600))
        comp.instructions = [ZoomInstruction(timeRange: full, trackID: videoTrack.trackID)]

        do {
            try await transcode(asset: asset, videoComposition: comp, req: req,
                                outputSize: outputSize, trimStart: trimStart, duration: duration)
        } catch {
            Emit.fail("导出失败：\(error.localizedDescription)")
        }
        Emit.ok(["stage": "exported", "output": req.output,
                 "width": outW, "height": outH, "duration": duration])
    }

    private static func transcode(asset: AVURLAsset,
                                  videoComposition: AVMutableVideoComposition,
                                  req: ExportRequest,
                                  outputSize: CGSize,
                                  trimStart: Double,
                                  duration: Double) async throws {
        let outURL = URL(fileURLWithPath: req.output)
        try? FileManager.default.removeItem(at: outURL)

        let reader = try AVAssetReader(asset: asset)
        reader.timeRange = CMTimeRange(start: CMTime(seconds: trimStart, preferredTimescale: 600),
                                       duration: CMTime(seconds: duration, preferredTimescale: 600))

        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        let vOut = AVAssetReaderVideoCompositionOutput(
            videoTracks: videoTracks,
            videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        vOut.videoComposition = videoComposition
        vOut.alwaysCopiesSampleData = false
        guard reader.canAdd(vOut) else { throw NSError(domain: "zhilu", code: -2,
            userInfo: [NSLocalizedDescriptionKey: "无法创建视频读取通道"]) }
        reader.add(vOut)

        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        var aOut: AVAssetReaderAudioMixOutput?
        if !audioTracks.isEmpty {
            let o = AVAssetReaderAudioMixOutput(audioTracks: audioTracks, audioSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVLinearPCMBitDepthKey: 32,
                AVLinearPCMIsFloatKey: true,
                AVLinearPCMIsNonInterleaved: false,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2
            ])
            if reader.canAdd(o) { reader.add(o); aOut = o }
        }

        let fileType: AVFileType = outURL.pathExtension.lowercased() == "mov" ? .mov : .mp4
        let writer = try AVAssetWriter(outputURL: outURL, fileType: fileType)

        let codec: AVVideoCodecType = (req.codec == "hevc") ? .hevc : .h264
        var props: [String: Any] = [
            AVVideoAverageBitRateKey: Int(req.bitrateMbps * 1_000_000),
            AVVideoExpectedSourceFrameRateKey: req.fps,
            AVVideoMaxKeyFrameIntervalKey: req.fps * 2
        ]
        if codec == .h264 { props[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel }
        let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: codec,
            AVVideoWidthKey: Int(outputSize.width),
            AVVideoHeightKey: Int(outputSize.height),
            AVVideoCompressionPropertiesKey: props
        ])
        vIn.expectsMediaDataInRealTime = false
        guard writer.canAdd(vIn) else { throw NSError(domain: "zhilu", code: -3,
            userInfo: [NSLocalizedDescriptionKey: "无法创建视频写入通道"]) }
        writer.add(vIn)

        var aIn: AVAssetWriterInput?
        if aOut != nil {
            let i = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 192_000
            ])
            i.expectsMediaDataInRealTime = false
            if writer.canAdd(i) { writer.add(i); aIn = i }
        }

        guard writer.startWriting() else {
            throw writer.error ?? NSError(domain: "zhilu", code: -4,
                userInfo: [NSLocalizedDescriptionKey: "无法开始写入"])
        }
        guard reader.startReading() else {
            throw reader.error ?? NSError(domain: "zhilu", code: -5,
                userInfo: [NSLocalizedDescriptionKey: "无法开始读取"])
        }
        writer.startSession(atSourceTime: CMTime(seconds: trimStart, preferredTimescale: 600))

        let group = DispatchGroup()
        let vQueue = DispatchQueue(label: "zhilu.write.video")
        var lastReported = -1.0

        group.enter()
        vIn.requestMediaDataWhenReady(on: vQueue) {
            while vIn.isReadyForMoreMediaData {
                guard reader.status == .reading, let sb = vOut.copyNextSampleBuffer() else {
                    vIn.markAsFinished(); group.leave(); return
                }
                let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb)) - trimStart
                let p = min(max(t / duration, 0), 1)
                if p - lastReported > 0.005 { lastReported = p; Emit.progress(p) }
                vIn.append(sb)
            }
        }

        if let aIn, let aOut {
            let aQueue = DispatchQueue(label: "zhilu.write.audio")
            group.enter()
            aIn.requestMediaDataWhenReady(on: aQueue) {
                while aIn.isReadyForMoreMediaData {
                    guard reader.status == .reading, let sb = aOut.copyNextSampleBuffer() else {
                        aIn.markAsFinished(); group.leave(); return
                    }
                    aIn.append(sb)
                }
            }
        }

        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            group.notify(queue: .global()) { cont.resume() }
        }

        if reader.status == .failed {
            throw reader.error ?? NSError(domain: "zhilu", code: -6,
                userInfo: [NSLocalizedDescriptionKey: "读取过程出错"])
        }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            writer.finishWriting { cont.resume() }
        }
        if writer.status == .failed {
            throw writer.error ?? NSError(domain: "zhilu", code: -7,
                userInfo: [NSLocalizedDescriptionKey: "写入过程出错"])
        }
        Emit.progress(1.0)
    }
}
