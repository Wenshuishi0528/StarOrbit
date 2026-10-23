import AppKit
import Foundation
let output = CommandLine.arguments[1]
let size = 1024
let image = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: image)
let canvas = NSRect(x: 48, y: 48, width: 928, height: 928)
let plate = NSBezierPath(roundedRect: canvas, xRadius: 205, yRadius: 205)
plate.addClip()
let gradient = NSGradient(colors: [NSColor(srgbRed: 0.025, green: 0.10, blue: 0.19, alpha: 1), NSColor(srgbRed: 0.008, green: 0.025, blue: 0.065, alpha: 1)])!
gradient.draw(in: plate, angle: 90)
func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ color: NSColor) {
    color.setFill(); NSBezierPath(ovalIn: NSRect(x: x-r, y: y-r, width: r*2, height: r*2)).fill()
}
let cyan = NSColor(srgbRed: 0.40, green: 0.87, blue: 0.98, alpha: 1)
for (x,y,r) in [(180,790,3),(269,895,2),(415,838,2),(739,835,3),(872,748,2),(150,600,2),(836,582,2),(594,905,2),(850,904,2),(200,400,2),(689,724,2)] {
    circle(CGFloat(x), CGFloat(y), CGFloat(r), NSColor(white: 0.90, alpha: 0.75))
}
let earth = NSBezierPath(ovalIn: NSRect(x: -135, y: -632, width: 1310, height: 1120))
NSGradient(colors: [NSColor(srgbRed: 0.025, green: 0.13, blue: 0.32, alpha: 1), NSColor(srgbRed: 0.03, green: 0.39, blue: 0.65, alpha: 1)])!.draw(in: earth, angle: 90)
cyan.withAlphaComponent(0.18).setStroke(); earth.lineWidth = 28; earth.stroke()
cyan.withAlphaComponent(0.8).setStroke(); earth.lineWidth = 4; earth.stroke()
// A folded T-shaped station and its paired laboratory arrays, drawn as vectors.
NSGraphicsContext.saveGraphicsState()
let transform = NSAffineTransform(); transform.translateX(by: 512, yBy: 548); transform.rotate(byDegrees: -24); transform.concat()
func box(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ color: NSColor, _ radius: CGFloat = 0) {
    color.setFill(); NSBezierPath(roundedRect: NSRect(x:x,y:y,width:w,height:h),xRadius:radius,yRadius:radius).fill()
}
let white = NSColor(srgbRed: 0.92, green: 0.96, blue: 0.98, alpha: 1)
let shade = NSColor(srgbRed: 0.57, green: 0.70, blue: 0.78, alpha: 1)
let panel = NSColor(srgbRed: 0.10, green: 0.25, blue: 0.41, alpha: 1)
func array(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) {
    box(x-3,y-3,w+6,h+6,white,2);box(x,y,w,h,panel)
    cyan.withAlphaComponent(0.75).setStroke()
    let grid = NSBezierPath();grid.lineWidth=1.7
    for j in 1...7 { let yy=y+h*CGFloat(j)/8;grid.move(to:NSPoint(x:x,y:yy));grid.line(to:NSPoint(x:x+w,y:yy)) }
    grid.move(to:NSPoint(x:x+w/2,y:y));grid.line(to:NSPoint(x:x+w/2,y:y+h));grid.stroke()
}
for x: CGFloat in [-204, 130] {
    box(x+34,-241,7,482,shade)
    array(x,-260,72,199);array(x,61,72,199)
    box(x+25,-61,26,122,white,8)
}
box(-170,-35,340,70,white,17)
box(-140,-35,47,70,shade,6);box(94,-35,40,70,shade,6)
box(-32,-145,64,168,white,14)
box(-21,-208,42,75,shade,10)
circle(0,0,47,white);circle(0,0,26,shade);circle(0,0,13,cyan)
box(-69,-164,138,8,white)
array(-110,-198,56,64);array(54,-198,56,64)
// Fine module seams remain readable at small icon sizes.
shade.setStroke();let seams = NSBezierPath();seams.lineWidth=3
for x: CGFloat in [-75,-48,60,82] { seams.move(to:NSPoint(x:x,y:-30));seams.line(to:NSPoint(x:x,y:30)) };seams.stroke()
NSGraphicsContext.restoreGraphicsState()
let border = NSBezierPath(roundedRect: NSRect(x:51,y:51,width:922,height:922),xRadius:202,yRadius:202)
cyan.withAlphaComponent(0.20).setStroke();border.lineWidth=3;border.stroke()
NSGraphicsContext.restoreGraphicsState()
try image.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
