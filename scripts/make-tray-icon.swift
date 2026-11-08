// Usage: swift make-tray-icon.swift <out-dir>
// Draws the menu-bar "template" glyph (black + alpha; macOS tints it for light/dark menu bars):
// a rounded screen with a play triangle, at 18pt @1x and @2x.
import AppKit

let outDir = CommandLine.arguments[1]
for scale in [1, 2] {
  let px = 18 * scale
  let s = CGFloat(scale)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.setStrokeColor(NSColor.black.cgColor)
  ctx.setFillColor(NSColor.black.cgColor)
  ctx.setLineWidth(1.6 * s)
  // Screen
  let screen = CGRect(x: 2 * s, y: 4 * s, width: 14 * s, height: 10.5 * s)
  ctx.addPath(CGPath(roundedRect: screen, cornerWidth: 2.6 * s, cornerHeight: 2.6 * s, transform: nil))
  ctx.strokePath()
  // Stand
  ctx.move(to: CGPoint(x: 6.5 * s, y: 1.6 * s)); ctx.addLine(to: CGPoint(x: 11.5 * s, y: 1.6 * s)); ctx.strokePath()
  // Play triangle
  ctx.move(to: CGPoint(x: 7.6 * s, y: 6.6 * s))
  ctx.addLine(to: CGPoint(x: 7.6 * s, y: 11.9 * s))
  ctx.addLine(to: CGPoint(x: 11.8 * s, y: 9.25 * s))
  ctx.closePath(); ctx.fillPath()
  NSGraphicsContext.restoreGraphicsState()
  let name = scale == 1 ? "trayTemplate.png" : "trayTemplate@2x.png"
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(outDir)/\(name)"))
}
print("ok")
