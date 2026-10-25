import AppKit
import Foundation
let output=URL(fileURLWithPath:CommandLine.arguments[1])
let cyan=NSColor(srgbRed:0.40,green:0.85,blue:0.98,alpha:1)
let white=NSColor(srgbRed:0.91,green:0.96,blue:0.985,alpha:1)
let stroke=NSColor(srgbRed:0.39,green:0.58,blue:0.69,alpha:1)
let panel=NSColor(srgbRed:0.085,green:0.24,blue:0.40,alpha:1)
func bitmap(_ w:Int,_ h:Int,_ draw:()->Void)->NSBitmapImageRep {
 let image=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:w,pixelsHigh:h,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:image);NSGraphicsContext.current!.imageInterpolation = .high
 draw();NSGraphicsContext.restoreGraphicsState();return image
}
func image(_ bitmap:NSBitmapImageRep)->NSImage{let im=NSImage(size:NSSize(width:bitmap.pixelsWide,height:bitmap.pixelsHigh));im.addRepresentation(bitmap);return im}
func circle(_ x:CGFloat,_ y:CGFloat,_ r:CGFloat,_ color:NSColor){color.setFill();NSBezierPath(ovalIn:NSRect(x:x-r,y:y-r,width:2*r,height:2*r)).fill()}
func line(_ a:NSPoint,_ b:NSPoint,_ color:NSColor=stroke,_ width:CGFloat=0.5){color.setStroke();let p=NSBezierPath();p.move(to:a);p.line(to:b);p.lineWidth=width;p.stroke()}
func box(_ x:CGFloat,_ y:CGFloat,_ w:CGFloat,_ h:CGFloat,_ color:NSColor=white,_ radius:CGFloat=0){let p=NSBezierPath(roundedRect:NSRect(x:x,y:y,width:w,height:h),xRadius:radius,yRadius:radius);color.setFill();p.fill()}
func outlineBox(_ x:CGFloat,_ y:CGFloat,_ w:CGFloat,_ h:CGFloat,_ r:CGFloat=0){let p=NSBezierPath(roundedRect:NSRect(x:x,y:y,width:w,height:h),xRadius:r,yRadius:r);white.setFill();p.fill();stroke.withAlphaComponent(0.8).setStroke();p.lineWidth=0.55;p.stroke()}
func polygon(_ vertices:[[CGFloat]],_ color:NSColor){let p=NSBezierPath();p.move(to:NSPoint(x:vertices[0][0],y:vertices[0][1]));for v in vertices.dropFirst(){p.line(to:NSPoint(x:v[0],y:v[1]))};p.close();color.setFill();p.fill();stroke.setStroke();p.lineWidth=0.5;p.stroke()}
func solar(_ x:CGFloat,_ y:CGFloat,_ w:CGFloat,_ h:CGFloat,_ longX:Bool){
 outlineBox(x,y,w,h);box(x+0.8,y+0.8,w-1.6,h-1.6,panel)
 let steps=longX ? 10:6
 for i in 1..<steps {let f=CGFloat(i)/CGFloat(steps);if longX{line(NSPoint(x:x+w*f,y:y+0.8),NSPoint(x:x+w*f,y:y+h-0.8),cyan.withAlphaComponent(0.7),0.32)}else{line(NSPoint(x:x+0.8,y:y+h*f),NSPoint(x:x+w-0.8,y:y+h*f),cyan.withAlphaComponent(0.7),0.32)}}
 if longX{box(x,y+h/2-0.55,w,1.1,white.withAlphaComponent(0.85))}else{box(x+w/2-0.55,y,1.1,h,white.withAlphaComponent(0.85))}
}
let manual=bitmap(1024,1024){
 // Exact orthographic projection used by the model render; dimensions in model mm.
 let tr=NSAffineTransform();tr.transformStruct=NSAffineTransformStruct(m11:0.47768336488993,m12:2.67787284850544,m21:-2.65379647161081,m22:0.52511556013044,tX:511.73477361178647,tY:511.96094608166436);tr.concat()
 for y:CGFloat in [-95.8,95.7]{box(-139,y-0.8,278,1.6,white);solar(-137.5,y-15,126.5,30,true);solar(11,y-15,126.5,30,true);outlineBox(-10,y-3.4,20,6.8,1)}
 box(-29,-70,2,140,white);solar(-43,13,30,57,false);solar(-43,-70,30,57,false)
 // Tianhe: flat aft face, wide cabin, shoulder and narrow cabin.
 outlineBox(-73,-10.5,35,21,1.5);box(-72.5,-10.5,34,2.2,NSColor(srgbRed:0.65,green:0.78,blue:0.84,alpha:1));line(NSPoint(x:-63,y:-10.2),NSPoint(x:-63,y:10.2));line(NSPoint(x:-38,y:-10.6),NSPoint(x:-38,y:10.6));
 polygon([[-38,-10.5],[-33,-7],[-33,7],[-38,10.5]],white);outlineBox(-33,-7,25.5,14,1)
 for x:CGFloat in [-27,-17]{line(NSPoint(x:x,y:-6),NSPoint(x:x,y:6),stroke.withAlphaComponent(0.45),0.35)}
 for y:CGFloat in [-6.7,6.7]{line(NSPoint(x:-60,y:y),NSPoint(x:-41,y:y),NSColor(srgbRed:0.78,green:0.69,blue:0.43,alpha:1),0.6)}
 // Wentian on the -Y port: working cabin, smaller airlock and tapered resource cabin.
 outlineBox(-4,-14,8,14,1);outlineBox(-10.35,-51,20.7,38,2.0)
 polygon([[-10.35,-51],[-6.65,-59],[6.65,-59],[10.35,-51]],white)
 // Angular equipment enclosure: straight corners and two shaded side faces.
 polygon([[-8.8,-72.8],[-8.8,-58.3],[-11.1,-59.6],[-11.1,-74.1]],NSColor(srgbRed:0.57,green:0.72,blue:0.81,alpha:1))
 polygon([[-8.8,-72.8],[8.8,-72.8],[6.5,-74.1],[-11.1,-74.1]],NSColor(srgbRed:0.70,green:0.82,blue:0.88,alpha:1))
 outlineBox(-8.8,-72.8,17.6,14.5,0);outlineBox(-5.7,-70.9,11.4,10.6,0)
 outlineBox(-6.65,-87,13.3,14,1.2)
 polygon([[-6.65,-87],[-5.3,-92],[5.3,-92],[6.65,-87]],white);outlineBox(-4.5,-95.8,9,4.5,0.6)
 for y:CGFloat in [-26,-40]{line(NSPoint(x:-10,y:y),NSPoint(x:10,y:y),stroke.withAlphaComponent(0.55),0.4)}
 for y:CGFloat in [-23,-34,-45]{outlineBox(-5,y,3,5,0.3)}
 circle(0,-66,2.3,stroke);circle(0,-66,1.65,cyan.withAlphaComponent(0.7))
 // Mengtian on +Y: separate payload bay and resource section.
 outlineBox(-4,0,8,14,1);outlineBox(-10.35,13,20.7,39.3,2)
 // The payload bay is a box, distinct from the cylindrical working cabin.
 polygon([[-9.4,52.3],[-9.4,73.6],[-11.7,72.3],[-11.7,51]],NSColor(srgbRed:0.57,green:0.72,blue:0.81,alpha:1))
 polygon([[-9.4,52.3],[9.4,52.3],[7.1,51],[-11.7,51]],NSColor(srgbRed:0.70,green:0.82,blue:0.88,alpha:1))
 outlineBox(-9.4,52.3,18.8,21.3,0);outlineBox(-5.8,55.5,11.6,14.8,0)
 outlineBox(-6.65,75.3,13.3,11.9,1)
 polygon([[-9.4,73.6],[-6.65,75.3],[6.65,75.3],[9.4,73.6]],white)
 polygon([[-6.65,87.2],[-5.3,92],[5.3,92],[6.65,87.2]],white);outlineBox(-4.5,91.8,9,3.9,0.6)
 outlineBox(8.5,55,5.3,12.5,0.5);outlineBox(-8,56,4,12,0.5)
 for y:CGFloat in [27,40]{line(NSPoint(x:-10,y:y),NSPoint(x:10,y:y),stroke.withAlphaComponent(0.55),0.4)}
 for y:CGFloat in [23,34,45]{outlineBox(-5,y,3,5,0.3)}
 circle(0,81.2,2.2,stroke);circle(0,81.2,1.6,cyan.withAlphaComponent(0.7))
 // Node in front, without an additional visiting spacecraft.
 circle(0,0,7.5,white);stroke.setStroke();let node=NSBezierPath(ovalIn:NSRect(x:-7.5,y:-7.5,width:15,height:15));node.lineWidth=0.6;node.stroke();circle(0,0,4.2,stroke.withAlphaComponent(0.6));circle(0,0,2.2,cyan)
 outlineBox(6,-2.4,3,4.8,0.4)
}
func background(){
 let plate=NSBezierPath(roundedRect:NSRect(x:48,y:48,width:928,height:928),xRadius:205,yRadius:205);plate.addClip()
 NSGradient(colors:[NSColor(srgbRed:0.025,green:0.09,blue:0.17,alpha:1),NSColor(srgbRed:0.007,green:0.02,blue:0.055,alpha:1)])!.draw(in:plate,angle:90)
 for (x,y,r): (CGFloat,CGFloat,CGFloat) in [(165,798,1.8),(271,883,1.4),(718,845,1.5),(862,767,1.4),(153,577,1.1),(878,565,1.1),(594,921,1.2),(855,903,1.1),(194,408,1.2),(695,720,1.1)] {circle(x,y,r,NSColor(white:0.85,alpha:0.65))}
 let earth=NSBezierPath(ovalIn:NSRect(x:-135,y:-660,width:1310,height:1120))
 NSGradient(colors:[NSColor(srgbRed:0.015,green:0.12,blue:0.27,alpha:1),NSColor(srgbRed:0.03,green:0.34,blue:0.55,alpha:1)])!.draw(in:earth,angle:90)
 cyan.withAlphaComponent(0.12).setStroke();earth.lineWidth=20;earth.stroke();cyan.withAlphaComponent(0.7).setStroke();earth.lineWidth=3;earth.stroke()
}
func cover(_ station:NSImage)->NSBitmapImageRep {
 bitmap(1024,1024){
  background();NSGraphicsContext.saveGraphicsState();let shadow=NSShadow();shadow.shadowColor=NSColor(white:0,alpha:0.5);shadow.shadowBlurRadius=10;shadow.shadowOffset=NSSize(width:0,height:-4);shadow.set();station.draw(in:NSRect(x:0,y:0,width:1024,height:1024));NSGraphicsContext.restoreGraphicsState()
  let border=NSBezierPath(roundedRect:NSRect(x:50,y:50,width:924,height:924),xRadius:203,yRadius:203);cyan.withAlphaComponent(0.18).setStroke();border.lineWidth=2;border.stroke()
 }
}
let result=cover(image(manual))
try result.representation(using:.png,properties:[:])!.write(to:output)
