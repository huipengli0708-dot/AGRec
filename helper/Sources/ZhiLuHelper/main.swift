import Foundation
import AVFoundation
import CoreGraphics
import ScreenCaptureKit
import AppKit

// 知录 helper：录制 / 导出 / 查询显示器与窗口 / 权限检查
// 用法：
//   zhilu-helper displays
//   zhilu-helper windows
//   zhilu-helper permission
//   zhilu-helper record <request.json>
//     向 stdin 写入一行 "pause" 暂停、"resume" 继续、"stop" 结束录制
//   zhilu-helper export <request.json>

func readRequest<T: Decodable>(_ path: String, as: T.Type) -> T {
    guard let data = FileManager.default.contents(atPath: path) else {
        Emit.fail("读取参数文件失败：\(path)")
    }
    do { return try JSONDecoder().decode(T.self, from: data) }
    catch { Emit.fail("参数格式错误：\(error)") }
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    Emit.fail("缺少子命令（displays / windows / permission / record / export）")
}

switch args[1] {

case "displays":
    var list: [[String: Any]] = []
    if #available(macOS 13.0, *) {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            let main = CGMainDisplayID()
            for d in content.displays {
                let b = CGDisplayBounds(d.displayID)
                list.append([
                    "id": d.displayID,
                    "width": Int(b.width),
                    "height": Int(b.height),
                    "originX": b.origin.x,
                    "originY": b.origin.y,
                    "isMain": d.displayID == main,
                    "name": d.displayID == main ? "主显示器" : "显示器 \(d.displayID)"
                ])
            }
        } catch {
            Emit.fail("获取显示器失败，请到「系统设置 → 隐私与安全性 → 屏幕录制」中允许本应用")
        }
    } else {
        Emit.fail("需要 macOS 13 或更高版本")
    }
    Emit.ok(["displays": list])

case "windows":
    var list: [[String: Any]] = []
    if #available(macOS 13.0, *) {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            for w in content.windows {
                guard w.isOnScreen, w.windowLayer == 0,
                      let title = w.title, !title.isEmpty else { continue }
                let appName = w.owningApplication?.applicationName ?? "未知应用"
                if appName.contains("知录") { continue }
                let f = w.frame
                if f.width < 120 || f.height < 80 { continue }
                list.append([
                    "id": w.windowID,
                    "title": title,
                    "app": appName,
                    "width": Int(f.width),
                    "height": Int(f.height)
                ])
            }
        } catch {
            Emit.fail("获取窗口列表失败，请检查「屏幕录制」权限是否已开启")
        }
    } else {
        Emit.fail("需要 macOS 13 或更高版本")
    }
    Emit.ok(["windows": list])

case "permission":
    var granted = false
    if #available(macOS 13.0, *) {
        granted = (try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true))
            .map { !$0.displays.isEmpty } ?? false
    }
    let mic = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
    Emit.ok(["screen": granted, "microphone": mic])

case "record":
    guard args.count >= 3 else { Emit.fail("record 需要参数文件路径") }
    guard #available(macOS 13.0, *) else { Emit.fail("录屏需要 macOS 13 或更高版本") }
    let req = readRequest(args[2], as: RecordRequest.self)

    if req.audioSource == "mic" {
        let ok = await AVCaptureDevice.requestAccess(for: .audio)
        if !ok { Emit.fail("麦克风权限被拒绝") }
    }

    let recorder = Recorder(req: req)
    do { try await recorder.start() }
    catch { Emit.fail("启动录制失败：\(error.localizedDescription)") }

    // 等待 stdin 的 "pause" / "resume" / "stop"，或 SIGINT。
    // 手动缩放走的是键盘状态轮询，不需要事件循环，所以这里保持最简单可靠的等待方式。
    let done = DispatchSemaphore(value: 0)
    let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .global())
    sigint.setEventHandler { done.signal() }
    sigint.resume()
    signal(SIGINT, SIG_IGN)

    DispatchQueue.global().async {
        while let line = readLine(strippingNewline: true) {
            let cmd = line.trimmingCharacters(in: .whitespaces)
            switch cmd {
            case "stop":
                done.signal()
                return
            case "pause":
                recorder.pause()
            case "resume":
                recorder.resume()
            default:
                break
            }
        }
        done.signal()
    }
    done.wait()

    // 看门狗：收尾这件事必须有个绝对上限。
    // AVAssetWriter.finishWriting 的回调在编码器出错时可能永远不来，
    // SCStream.stopCapture 也可能挂住——真发生了，这个进程就变成一个
    // 谁都杀不掉、还占着屏幕采集和编码器的僵尸，用户只会感觉「电脑越来越卡」。
    // 宁可交一个不完整的文件，也不能留一个不死的进程。
    let watchdog = DispatchQueue(label: "zhilu.watchdog")
    watchdog.asyncAfter(deadline: .now() + 20) {
        Emit.line(["type": "error", "message": "录制收尾超时，已强制结束；这一段视频可能不完整"])
        exit(2)
    }

    await recorder.stop()

    // 正常收尾也要显式退出。stdin 那个 readLine 线程还阻塞着，
    // sigint source 也还挂着，交给运行时自己收场不够确定。
    exit(0)

case "export":
    guard args.count >= 3 else { Emit.fail("export 需要参数文件路径") }
    guard #available(macOS 13.0, *) else { Emit.fail("需要 macOS 13 或更高版本") }
    let req = readRequest(args[2], as: ExportRequest.self)
    await Exporter.run(req)

default:
    Emit.fail("未知子命令：\(args[1])")
}
