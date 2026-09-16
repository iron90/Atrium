import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let size = 512
let outputPath = CommandLine.arguments.dropFirst().first ?? "src-tauri/icons/icon.png"
let colorSpace = CGColorSpaceCreateDeviceRGB()
var pixels = [UInt8](repeating: 0, count: size * size * 4)
let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
guard let context = CGContext(
    data: &pixels,
    width: size,
    height: size,
    bitsPerComponent: 8,
    bytesPerRow: size * 4,
    space: colorSpace,
    bitmapInfo: bitmapInfo
) else {
    fatalError("Unable to create icon drawing context")
}

context.setFillColor(CGColor(red: 0.04, green: 0.10, blue: 0.14, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: size, height: size))

let inset: CGFloat = 24
let card = CGRect(x: inset, y: inset, width: CGFloat(size) - inset * 2, height: CGFloat(size) - inset * 2)
context.setFillColor(CGColor(red: 0.07, green: 0.19, blue: 0.24, alpha: 1))
context.addPath(CGPath(roundedRect: card, cornerWidth: 100, cornerHeight: 100, transform: nil))
context.fillPath()

context.setStrokeColor(CGColor(red: 0.47, green: 0.82, blue: 0.76, alpha: 1))
context.setLineWidth(42)
context.setLineCap(.round)
context.setLineJoin(.round)
context.move(to: CGPoint(x: 148, y: 150))
context.addLine(to: CGPoint(x: 256, y: 365))
context.addLine(to: CGPoint(x: 364, y: 150))
context.move(to: CGPoint(x: 190, y: 266))
context.addLine(to: CGPoint(x: 322, y: 266))
context.strokePath()

guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(
          URL(fileURLWithPath: outputPath) as CFURL,
          UTType.png.identifier as CFString,
          1,
          nil
      ) else {
    fatalError("Unable to create icon image")
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
    fatalError("Unable to write icon image")
}
