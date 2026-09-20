// Render the existing system-font masthead as a standalone share card.
// Run on macOS: swift scripts/render_brand_share_card.swift
import AppKit
import CoreText
import ImageIO
import UniformTypeIdentifiers

let width = 1200
let height = 630
let fontSize: CGFloat = 116
let font = CTFontCreateWithName("Georgia-Bold" as CFString, fontSize, nil)
precondition(CTFontCopyPostScriptName(font) as String == "Georgia-Bold", "Georgia Bold is required to match the masthead.")
let paper = CGColor(srgbRed: 234 / 255, green: 219 / 255, blue: 193 / 255, alpha: 1)
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
    bytesPerRow: width * 4, space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: width, height: height))
context.setShouldAntialias(true)
context.setShouldSmoothFonts(false)

let attributes: [NSAttributedString.Key: Any] = [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): paper,
    NSAttributedString.Key(kCTKernAttributeName as String): fontSize * 0.16
]
let lines = ["OUTSIDE", "IN PRINT"].map {
    CTLineCreateWithAttributedString(NSAttributedString(string: $0, attributes: attributes))
}
let bounds = lines.map { CTLineGetBoundsWithOptions($0, .useGlyphPathBounds) }
// Masthead line-height 1.02 plus its .12rem gap, scaled from the 72px desktop title.
let baselineAdvance = fontSize * (1.02 + 1.92 / 72)
let blockBounds = bounds[0].offsetBy(dx: 0, dy: baselineAdvance).union(bounds[1])
let bottomBaseline = (CGFloat(height) - blockBounds.height) / 2 - blockBounds.minY
for index in lines.indices {
    context.textPosition = CGPoint(
        x: (CGFloat(width) - bounds[index].width) / 2 - bounds[index].minX,
        y: bottomBaseline + (index == 0 ? baselineAdvance : 0)
    )
    CTLineDraw(lines[index], context)
}

let output = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first
    ?? "static/images/brand/outside-in-print-share.png")
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil)
precondition(CGImageDestinationFinalize(destination), "Unable to save the share card.")
print("Rendered \(width)x\(height) share card: \(output.path)")
