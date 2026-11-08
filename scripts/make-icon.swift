// Usage: swift make-icon.swift <source.png> <out.png>
// Produces a macOS-style app icon: artwork clipped to a squircle on Apple's 1024 grid
// (824pt shape centered with 100pt margins) plus the standard soft drop shadow.
import AppKit

let args = CommandLine.arguments
guard args.count == 3, let src = NSImage(contentsOfFile: args[1]) else { fatalError("usage: make-icon <src> <out>") }

let canvas: CGFloat = 1024, shape: CGFloat = 824
let origin = (canvas - shape) / 2
let rect = CGRect(x: origin, y: origin + 10, width: shape, height: shape) // nudged up to leave room for the shadow

/// Superellipse |x|^n + |y|^n = 1 — the continuous-curvature "squircle" macOS icons use.
func squircle(in r: CGRect, n: CGFloat = 5) -> CGPath {
  let path = CGMutablePath()
  let a = r.width / 2, b = r.height / 2, cx = r.midX, cy = r.midY
  let steps = 720
  for i in 0...steps {
    let t = CGFloat(i) / CGFloat(steps) * 2 * .pi
    let c = cos(t), s = sin(t)
    let x = cx + a * (c < 0 ? -1 : 1) * pow(abs(c), 2 / n)
    let y = cy + b * (s < 0 ? -1 : 1) * pow(abs(s), 2 / n)
    i == 0 ? path.move(to: CGPoint(x: x, y: y)) : path.addLine(to: CGPoint(x: x, y: y))
  }
  path.closeSubpath()
  return path
}

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(canvas), pixelsHigh: Int(canvas), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext
ctx.interpolationQuality = .high
let shapePath = squircle(in: rect)

// Drop shadow, drawn from the filled shape before clipping.
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 24, color: NSColor.black.withAlphaComponent(0.35).cgColor)
ctx.addPath(shapePath)
ctx.setFillColor(NSColor.black.cgColor)
ctx.fillPath()
ctx.restoreGState()

// Artwork, slightly overscaled so the source's own rounded corners fall outside the squircle.
ctx.saveGState()
ctx.addPath(shapePath)
ctx.clip()
let bleed: CGFloat = 0.04 * shape
src.draw(in: rect.insetBy(dx: -bleed, dy: -bleed), from: .zero, operation: .copy, fraction: 1)
ctx.restoreGState()

// Hairline edge highlight, as on system icons.
ctx.addPath(shapePath)
ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.12).cgColor)
ctx.setLineWidth(2)
ctx.strokePath()

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("wrote", args[2])
