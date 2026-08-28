import Foundation

// MARK: - 鼠标轨迹

struct MouseSample: Codable {
    let t: Double      // 相对录制开始的秒数
    let x: Double      // 屏幕坐标（点），左上角原点
    let y: Double
    let down: Bool     // 左键是否按下
    var z: Double?     // 手动缩放级别（快捷键+滚轮 / 点击开关），1.0 表示没有手动放大

    enum CodingKeys: String, CodingKey { case t, x, y, down, z }

    init(t: Double, x: Double, y: Double, down: Bool, z: Double? = nil) {
        self.t = t; self.x = x; self.y = y; self.down = down; self.z = z
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        t = try c.decode(Double.self, forKey: .t)
        x = try c.decode(Double.self, forKey: .x)
        y = try c.decode(Double.self, forKey: .y)
        down = try c.decode(Bool.self, forKey: .down)
        z = try c.decodeIfPresent(Double.self, forKey: .z)
    }
}

struct MouseTrack: Codable {
    var width: Double      // 录制显示器宽度（点）
    var height: Double     // 录制显示器高度（点）
    var originX: Double    // 显示器在全局坐标中的原点
    var originY: Double
    var samples: [MouseSample]
}

// MARK: - 放大片段

struct ZoomSegment: Codable {
    var start: Double            // 秒
    var end: Double              // 秒（含缓出结束）
    var zoomIn: Double           // 缓入时长（秒）
    var zoomOut: Double          // 缓出时长（秒）
    var scale: Double            // 放大倍数，例如 1.8
    var focusX: Double           // 归一化 0~1，跟随关闭时使用
    var focusY: Double
    var follow: Bool             // 是否在片段内跟随鼠标平移
    var easing: String           // quadOut | cubicOut | inOutQuad
    /// true 时导出阶段直接回放录制时的真实缩放曲线，不再套自动缓入缓出包络
    var trackCurve: Bool = false
}

// MARK: - 鼠标样式

struct CursorStyle: Codable {
    var kind: String             // arrow | arrowLight | dot | ring | halo | none
    var size: Double             // 相对倍数，1.0 = 32pt
    var color: String            // #RRGGBB
    var outlineColor: String     // #RRGGBB
    var clickRipple: Bool        // 点击水波纹
    var smoothing: Double        // 0~1，指数平滑系数（越大越跟手）
    var scaleWithZoom: Bool      // 放大时鼠标是否一起放大
}

// MARK: - 录制请求

struct RecordRequest: Codable {
    var output: String           // 输出 .mov 路径
    var trackPath: String        // 鼠标轨迹 json 路径
    var displayID: UInt32
    var width: Int
    var height: Int
    var fps: Int
    var bitrateMbps: Double
    var codec: String            // h264 | hevc
    var audioSource: String      // none | system | mic
    var mode: String             // display | area | window
    var areaX: Double            // mode == area 时，相对所选显示器左上角的偏移（点）
    var areaY: Double
    var areaWidth: Double
    var areaHeight: Double
    var windowID: UInt32         // mode == window 时的目标窗口

    // 录制时的实时预览 / 手动放大所需的参数
    var zoomScale: Double        // 放大倍数
    /// 放大方式，五选一：
    /// none        不放大
    /// dwell       鼠标停留自动放大
    /// click       左键点击自动放大（一段时间后缩回）
    /// clickToggle 点一下放大，再点一下缩回
    /// manual      按住 Z + 滚轮调节，按 X 缩回
    var trigger: String
    var dwellTime: Double
    var dwellRadius: Double
}

// MARK: - 导出请求

struct ExportRequest: Codable {
    var input: String
    var output: String
    var width: Int
    var height: Int
    var fps: Int
    var bitrateMbps: Double
    var codec: String            // h264 | hevc
    var segments: [ZoomSegment]
    var cursor: CursorStyle
    var track: MouseTrack
    var trimStart: Double
    var trimEnd: Double          // <=0 表示到结尾
}

// MARK: - 工具

enum Emit {
    static let lock = NSLock()
    static func line(_ obj: [String: Any]) {
        lock.lock(); defer { lock.unlock() }
        if let d = try? JSONSerialization.data(withJSONObject: obj),
           let s = String(data: d, encoding: .utf8) {
            print(s)
            fflush(stdout)
        }
    }
    static func progress(_ p: Double) { line(["type": "progress", "value": p]) }
    static func ok(_ payload: [String: Any] = [:]) {
        var o = payload; o["type"] = "ok"; line(o)
    }
    static func fail(_ msg: String) -> Never {
        line(["type": "error", "message": msg])
        exit(1)
    }
}

extension String {
    /// #RRGGBB -> (r,g,b) 0~1
    var rgbComponents: (Double, Double, Double) {
        var hex = self.trimmingCharacters(in: .whitespaces)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let v = UInt32(hex, radix: 16) else { return (1, 1, 1) }
        return (Double((v >> 16) & 0xFF) / 255.0,
                Double((v >> 8) & 0xFF) / 255.0,
                Double(v & 0xFF) / 255.0)
    }
}
