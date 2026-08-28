import Foundation
import CoreGraphics
import AppKit

/// 生成自定义鼠标指针位图。
/// 返回图像与「热点」（热点为归一化坐标，0~1，表示指针尖端在图像中的位置）
enum CursorRenderer {

    static func make(style: CursorStyle, pixelSize: Int) -> (image: CGImage, hotspot: CGPoint)? {
        if style.kind == "none" { return nil }
        let s = max(16, pixelSize)
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: nil, width: s, height: s,
                                  bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.setAllowsAntialiasing(true)
        ctx.interpolationQuality = .high
        // Core Graphics 位图原点在左下，这里统一翻转成左上原点作图
        ctx.translateBy(x: 0, y: CGFloat(s))
        ctx.scaleBy(x: 1, y: -1)

        let (r, g, b) = style.color.rgbComponents
        let (orr, og, ob) = style.outlineColor.rgbComponents
        let fill = CGColor(red: r, green: g, blue: b, alpha: 1)
        let outline = CGColor(red: orr, green: og, blue: ob, alpha: 1)
        let d = CGFloat(s)
        var hotspot = CGPoint(x: 0.5, y: 0.5)

        switch style.kind {
        case "arrow", "arrowLight":
            hotspot = CGPoint(x: 0.16, y: 0.10)
            let pts: [CGPoint] = [
                CGPoint(x: 0.16, y: 0.10), CGPoint(x: 0.16, y: 0.86),
                CGPoint(x: 0.35, y: 0.68), CGPoint(x: 0.47, y: 0.95),
                CGPoint(x: 0.60, y: 0.89), CGPoint(x: 0.48, y: 0.63),
                CGPoint(x: 0.72, y: 0.62)
            ].map { CGPoint(x: $0.x * d, y: $0.y * d) }

            let path = CGMutablePath()
            path.addLines(between: pts)
            path.closeSubpath()

            ctx.setShadow(offset: CGSize(width: 0, height: 1.5 * d / 64),
                          blur: 3 * d / 64,
                          color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.45))
            ctx.addPath(path)
            ctx.setFillColor(style.kind == "arrowLight" ? outline : fill)
            ctx.fillPath()
            ctx.setShadow(offset: .zero, blur: 0, color: nil)

            ctx.addPath(path)
            ctx.setStrokeColor(style.kind == "arrowLight" ? fill : outline)
            ctx.setLineWidth(d * 0.045)
            ctx.setLineJoin(.round)
            ctx.strokePath()

        case "dot":
            hotspot = CGPoint(x: 0.5, y: 0.5)
            let rect = CGRect(x: d * 0.22, y: d * 0.22, width: d * 0.56, height: d * 0.56)
            ctx.setShadow(offset: CGSize(width: 0, height: 1.5 * d / 64),
                          blur: 4 * d / 64,
                          color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.4))
            ctx.setFillColor(fill)
            ctx.fillEllipse(in: rect)
            ctx.setShadow(offset: .zero, blur: 0, color: nil)
            ctx.setStrokeColor(outline)
            ctx.setLineWidth(d * 0.05)
            ctx.strokeEllipse(in: rect)

        case "ring":
            hotspot = CGPoint(x: 0.5, y: 0.5)
            let rect = CGRect(x: d * 0.18, y: d * 0.18, width: d * 0.64, height: d * 0.64)
            ctx.setStrokeColor(fill)
            ctx.setLineWidth(d * 0.09)
            ctx.strokeEllipse(in: rect)
            let inner = CGRect(x: d * 0.44, y: d * 0.44, width: d * 0.12, height: d * 0.12)
            ctx.setFillColor(fill)
            ctx.fillEllipse(in: inner)

        case "halo":
            hotspot = CGPoint(x: 0.5, y: 0.5)
            let center = CGPoint(x: d / 2, y: d / 2)
            let colors = [CGColor(red: r, green: g, blue: b, alpha: 0.55),
                          CGColor(red: r, green: g, blue: b, alpha: 0.0)] as CFArray
            if let grad = CGGradient(colorsSpace: cs, colors: colors, locations: [0, 1]) {
                ctx.drawRadialGradient(grad, startCenter: center, startRadius: 0,
                                       endCenter: center, endRadius: d * 0.5,
                                       options: [])
            }
            let rect = CGRect(x: d * 0.40, y: d * 0.40, width: d * 0.20, height: d * 0.20)
            ctx.setFillColor(fill)
            ctx.fillEllipse(in: rect)

        default:
            return nil
        }

        guard let img = ctx.makeImage() else { return nil }
        return (img, hotspot)
    }

    /// 点击水波纹环
    static func ripple(color: String, pixelSize: Int) -> CGImage? {
        let s = max(32, pixelSize)
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: nil, width: s, height: s,
                                  bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let (r, g, b) = color.rgbComponents
        let d = CGFloat(s)
        ctx.setStrokeColor(CGColor(red: r, green: g, blue: b, alpha: 1))
        ctx.setLineWidth(d * 0.06)
        ctx.strokeEllipse(in: CGRect(x: d * 0.08, y: d * 0.08, width: d * 0.84, height: d * 0.84))
        return ctx.makeImage()
    }
}
