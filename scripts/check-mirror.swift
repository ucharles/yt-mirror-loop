// E-06 visual assertion: the asym_arrow fixture has its bright block on the LEFT; when mirrored it must be on the RIGHT.
// usage: swift scripts/check-mirror.swift <png> <left|right>
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count == 3, let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  print("usage: check-mirror.swift <png> <left|right>"); exit(2)
}
let w = img.width, h = img.height
var px = [UInt8](repeating: 0, count: w * h * 4)
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
var left = 0, right = 0
for y in stride(from: 0, to: h, by: 2) {
  for x in stride(from: 0, to: w, by: 2) {
    let i = (y * w + x) * 4
    if px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200 { if x < w / 2 { left += 1 } else { right += 1 } }
  }
}
let side = right > left * 3 ? "right" : (left > right * 3 ? "left" : "unclear")
print("\(args[1].split(separator: "/").last!): bright left=\(left) right=\(right) → \(side)")
exit(side == args[2] ? 0 : 1)
