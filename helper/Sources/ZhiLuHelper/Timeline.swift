import Foundation
import CoreGraphics

/// 逐帧预计算的动画参数。放在导出前一次性算完，
/// 保证合成阶段（可能并行、乱序调用）拿到的是确定性结果。
final class Timeline {

    struct Frame {
        var zoom: Double        // >= 1
        var focusX: Double      // 归一化 0~1（源画面，左上原点）
        var focusY: Double
        var cursorX: Double     // 源画面像素比例 0~1
        var cursorY: Double
        var rippleScale: Double // 0 表示不显示
        var rippleAlpha: Double
    }

    let fps: Int
    let frames: [Frame]

    init(request: ExportRequest, duration: Double) {
        self.fps = request.fps
        let n = max(1, Int((duration * Double(request.fps)).rounded()))
        let track = request.track
        let dt = 1.0 / Double(request.fps)

        // ---- 1. 把鼠标轨迹重采样到每帧，并做指数平滑 ----
        let smoothing = min(max(request.cursor.smoothing, 0.05), 1.0)
        let cursorAlpha = 1 - pow(1 - smoothing, 1)   // 指针本身的跟手程度
        let focusAlpha = 0.045                        // 画面跟随更慢，避免抖动

        var rawX = [Double](repeating: 0.5, count: n)
        var rawY = [Double](repeating: 0.5, count: n)
        var downs = [Bool](repeating: false, count: n)

        if !track.samples.isEmpty && track.width > 0 && track.height > 0 {
            var idx = 0
            for i in 0..<n {
                let t = request.trimStart + Double(i) * dt
                while idx + 1 < track.samples.count && track.samples[idx + 1].t <= t { idx += 1 }
                let s0 = track.samples[min(idx, track.samples.count - 1)]
                // 采样点之间做线性插值。直接取「上一个采样点」的话，每帧最多会落后
                // 一个采样间隔（约 8ms）的位移，鼠标甩得快时这点差距肉眼看得出来。
                var px = s0.x, py = s0.y
                if idx + 1 < track.samples.count {
                    let s1 = track.samples[idx + 1]
                    let span = s1.t - s0.t
                    if span > 1e-6 {
                        let k = min(max((t - s0.t) / span, 0), 1)
                        px = s0.x + (s1.x - s0.x) * k
                        py = s0.y + (s1.y - s0.y) * k
                    }
                }
                rawX[i] = min(max(px / track.width, 0), 1)
                rawY[i] = min(max(py / track.height, 0), 1)
                downs[i] = s0.down
            }
        }

        var smX = [Double](repeating: 0, count: n)
        var smY = [Double](repeating: 0, count: n)

        // 指针平滑用「前向 + 反向」各滤一次（零相位滤波）。
        // 只做一次前向 EMA 的话，画出来的指针会永远落在真实位置后面：
        // 快速把鼠标甩到按钮上点一下时，指针还停在半路，看起来就是
        // 「录出来的鼠标和真正点击的位置对不上」。反向再滤一次能把这个滞后抵消掉，
        // 抖动照样被抹平。导出是离线算的、能看到完整轨迹，所以可以这么做。
        var curX = rawX.first ?? 0.5, curY = rawY.first ?? 0.5
        for i in 0..<n {
            curX += (rawX[i] - curX) * cursorAlpha
            curY += (rawY[i] - curY) * cursorAlpha
            smX[i] = curX; smY[i] = curY
        }
        curX = smX.last ?? curX; curY = smY.last ?? curY
        for i in stride(from: n - 1, through: 0, by: -1) {
            curX += (smX[i] - curX) * cursorAlpha
            curY += (smY[i] - curY) * cursorAlpha
            smX[i] = curX; smY[i] = curY
        }

        // 画面跟随（取景中心）保持单向平滑——这里的滞后是故意的，
        // 镜头慢半拍才不会跟着鼠标一起抖，而且它不影响指针画在哪。
        var focX = rawX.first ?? 0.5, focY = rawY.first ?? 0.5
        var fX = [Double](repeating: 0, count: n)
        var fY = [Double](repeating: 0, count: n)
        for i in 0..<n {
            focX += (rawX[i] - focX) * focusAlpha
            focY += (rawY[i] - focY) * focusAlpha
            fX[i] = focX; fY[i] = focY
        }

        // ---- 1b. 手动缩放（trackCurve）：把录制时逐帧写下的真实缩放值重采样到每帧，
        //          再做一点点平滑去掉重采样带来的台阶感——但不改变「停在哪就是哪」这件事。
        //          这条曲线就是用户当时手上 A+Z/A+X 按出来的原始轨迹，导出时原样回放。
        var rawZoom = [Double](repeating: 1.0, count: n)
        if !track.samples.isEmpty && track.width > 0 && track.height > 0 {
            var zi = 0
            for i in 0..<n {
                let t = request.trimStart + Double(i) * dt
                while zi + 1 < track.samples.count && track.samples[zi + 1].t <= t { zi += 1 }
                let s = track.samples[min(zi, track.samples.count - 1)]
                let zv = s.z ?? 1.0
                rawZoom[i] = zv.isFinite && zv >= 1.0 ? zv : 1.0
            }
        }
        var curveZoom = [Double](repeating: 1.0, count: n)
        var cz = rawZoom.first ?? 1.0
        let zoomAlpha = 0.25
        for i in 0..<n {
            cz += (rawZoom[i] - cz) * zoomAlpha
            curveZoom[i] = cz
        }

        // ---- 2. 点击水波纹 ----
        let rippleDur = 0.5
        var clickTimes: [Double] = []
        var prev = false
        for i in 0..<n {
            if downs[i] && !prev { clickTimes.append(Double(i) * dt) }
            prev = downs[i]
        }

        // ---- 3. 逐帧求缩放 ----
        var out = [Frame]()
        out.reserveCapacity(n)
        for i in 0..<n {
            let t = Double(i) * dt + request.trimStart
            var zoom = 1.0
            var fx = 0.5, fy = 0.5

            // 手动缩放（trackCurve）优先：直接回放当时录下的真实曲线，
            // 何时停、停在哪个倍数都照原样呈现，不再套自动缓入缓出包络。
            if let curveSeg = request.segments.first(where: { $0.trackCurve && t >= $0.start && t <= $0.end }) {
                zoom = max(curveZoom[i], 1.0)
                let p = min(max((zoom - 1) / max(curveSeg.scale - 1, 0.0001), 0), 1)
                let targetX = curveSeg.follow ? fX[i] : curveSeg.focusX
                let targetY = curveSeg.follow ? fY[i] : curveSeg.focusY
                fx = 0.5 + (targetX - 0.5) * p
                fy = 0.5 + (targetY - 0.5) * p
            } else {
                var best = 0.0
                for seg in request.segments {
                    guard !seg.trackCurve, t >= seg.start && t <= seg.end else { continue }
                    let zi = max(seg.zoomIn, 0.01)
                    let zo = max(seg.zoomOut, 0.01)
                    var p: Double
                    if t < seg.start + zi {
                        p = Timeline.ease((t - seg.start) / zi, seg.easing)
                    } else if t > seg.end - zo {
                        p = Timeline.ease((seg.end - t) / zo, seg.easing)
                    } else {
                        p = 1
                    }
                    p = min(max(p, 0), 1)
                    if p <= best { continue }
                    best = p
                    zoom = 1 + (seg.scale - 1) * p
                    let targetX = seg.follow ? fX[i] : seg.focusX
                    let targetY = seg.follow ? fY[i] : seg.focusY
                    // 缩放没起来时把焦点拉回画面中心，避免 1 倍时也在平移
                    fx = 0.5 + (targetX - 0.5) * p
                    fy = 0.5 + (targetY - 0.5) * p
                }
            }

            var rs = 0.0, ra = 0.0
            if request.cursor.clickRipple {
                for ct in clickTimes {
                    let d = Double(i) * dt - ct
                    if d >= 0 && d <= rippleDur {
                        let u = d / rippleDur
                        rs = 0.35 + 1.15 * (1 - pow(1 - u, 3))
                        ra = 0.75 * (1 - u) * (1 - u)
                        break
                    }
                }
            }

            out.append(Frame(zoom: zoom, focusX: fx, focusY: fy,
                             cursorX: smX[i], cursorY: smY[i],
                             rippleScale: rs, rippleAlpha: ra))
        }
        self.frames = out
    }

    func frame(at seconds: Double) -> Frame {
        guard !frames.isEmpty else {
            return Frame(zoom: 1, focusX: 0.5, focusY: 0.5, cursorX: 0.5, cursorY: 0.5,
                         rippleScale: 0, rippleAlpha: 0)
        }
        let i = Int((seconds * Double(fps)).rounded())
        return frames[min(max(i, 0), frames.count - 1)]
    }

    /// u: 0~1，返回缓动后的进度
    static func ease(_ u: Double, _ kind: String) -> Double {
        let x = min(max(u, 0), 1)
        switch kind {
        case "cubicOut":  return 1 - pow(1 - x, 3)
        case "inOutQuad": return x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2
        default:          return 1 - pow(1 - x, 2)   // quadOut：二次方缓出
        }
    }
}
