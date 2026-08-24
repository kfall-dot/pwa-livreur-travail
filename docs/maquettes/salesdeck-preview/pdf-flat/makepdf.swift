import Foundation
import Quartz
import AppKit

let listPath = CommandLine.arguments.count > 1
  ? CommandLine.arguments[1]
  : "docs/maquettes/salesdeck-preview/pdf-flat/pages.txt"
let outPath = CommandLine.arguments.count > 2
  ? CommandLine.arguments[2]
  : "docs/TraceO_SalesDeck_Premium.pdf"

let paths = try! String(contentsOfFile: listPath)
  .split(separator: "\n")
  .map(String.init)
  .filter { !$0.isEmpty }

let pdf = PDFDocument()
for (i, p) in paths.enumerated() {
  guard let img = NSImage(contentsOfFile: p), let page = PDFPage(image: img) else {
    fputs("fail \(p)\n", stderr)
    exit(1)
  }
  pdf.insert(page, at: i)
}
pdf.write(to: URL(fileURLWithPath: outPath))
print("wrote \(outPath) pages=\(pdf.pageCount)")
