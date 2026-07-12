const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const root = path.resolve(__dirname, "..");

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });

  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

class TestFile extends Blob {
  constructor(parts, name, options = {}) {
    super(parts, options);
    this.name = name;
    this.lastModified = Date.now();
    this.webkitRelativePath = "";
  }
}

class TestFileReader {
  readAsDataURL(file) {
    file.arrayBuffer()
      .then((buffer) => {
        const base64 = Buffer.from(buffer).toString("base64");
        this.result = `data:${file.type};base64,${base64}`;
        this.onload?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}

global.File = TestFile;
global.FileReader = TestFileReader;
global.atob = global.atob || ((text) => Buffer.from(text, "base64").toString("binary"));

async function createPdfFile(name, label, pageCount = 1) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < pageCount; i += 1) {
    const page = pdf.addPage();
    page.setSize(400, 520);
    page.drawText(`${label} page ${i + 1}`, {
      x: 48,
      y: 450,
      size: 22,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  return new TestFile([bytes], name, { type: "application/pdf" });
}

function createPngFile() {
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  return new TestFile([Buffer.from(pngBase64, "base64")], "pixel.png", { type: "image/png" });
}

async function assertPdfBytes(label, bytes, expectedPages) {
  const length = bytes.byteLength ?? bytes.length ?? 0;
  if (length <= 0) throw new Error(`${label} produced an empty file`);

  const pdf = await PDFDocument.load(bytes);
  const pageCount = pdf.getPageCount();
  if (expectedPages !== undefined && pageCount !== expectedPages) {
    throw new Error(`${label} produced ${pageCount} pages, expected ${expectedPages}`);
  }

  return { label, bytes: length, pages: pageCount };
}

async function main() {
  const pdfUtils = loadTsModule("src/lib/pdf-utils.ts");
  const download = loadTsModule("src/lib/download.ts");

  const first = await createPdfFile("first.pdf", "First", 2);
  const second = await createPdfFile("second.pdf", "Second", 1);

  const results = [];
  results.push(await assertPdfBytes("mergePDFs", await pdfUtils.mergePDFs([first, second]), 3));
  results.push(await assertPdfBytes("splitPDF", await pdfUtils.splitPDF(first, [1]), 1));
  results.push(await assertPdfBytes("compressPDF", await pdfUtils.compressPDF(first), 2));
  results.push(await assertPdfBytes("sanitizePDF", await pdfUtils.sanitizePDF(first), 2));
  results.push(await assertPdfBytes("addWatermark", await pdfUtils.addWatermark(first, {
    text: "CONFIDENTIAL",
    opacity: 0.35,
    rotation: 35,
    color: [0.4, 0.4, 0.4],
    fontSize: 40,
  }), 2));
  results.push(await assertPdfBytes("signPDF", await pdfUtils.signPDF(first, createPngFileDataUrl(), 0, {
    x: 40,
    y: 40,
    width: 80,
    height: 30,
  }), 2));
  results.push(await assertPdfBytes("imagesToPDF", await pdfUtils.imagesToPDF([createPngFile()]), 1));

  const blob = download.createDownloadBlob(await pdfUtils.mergePDFs([first, second]));
  if (blob.size <= 0) throw new Error("createDownloadBlob produced a zero-byte Blob");
  results.push({ label: "createDownloadBlob", bytes: blob.size });

  console.table(results);
}

function createPngFileDataUrl() {
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  return `data:image/png;base64,${pngBase64}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
