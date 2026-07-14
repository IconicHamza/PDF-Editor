import { PDFDocument, rgb, PDFOperator, PDFNumber, StandardFonts, PDFOperatorNames } from "pdf-lib";
import type PDFFont from "pdf-lib/cjs/api/PDFFont";

export interface TextItemData {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[]; // [scaleX, skewX, skewY, scaleY, translateX, translateY]
  fontName: string;
}

export interface TextEditData {
  originalItem: TextItemData;
  newText: string;
  color: [number, number, number]; // RGB 0-1, sampled glyph color
  bgColor: [number, number, number]; // RGB 0-1, sampled background color
}

// ─── Font Matching ──────────────────────────────────────────────────────────

/**
 * Maps pdfjs font family/name substrings to a pdf-lib StandardFonts enum value.
 * These standard 14 fonts are always embedded in full (not subsetted) by pdf-lib,
 * guaranteeing full WinAnsi Latin glyph coverage for replacement text.
 */
export function getStandardFontName(fontFamily: string, fontName: string): StandardFonts {
  const f = (fontFamily || "").toLowerCase();
  const n = (fontName || "").toLowerCase();

  const isBold = f.includes("bold") || n.includes("bold");
  const isItalic =
    f.includes("italic") || f.includes("oblique") ||
    n.includes("italic") || n.includes("oblique");
  const isSerif =
    f.includes("times") || f.includes("serif") ||
    n.includes("times") || n.includes("serif");
  const isMono =
    f.includes("courier") || f.includes("monospace") || f.includes("mono") ||
    n.includes("courier") || n.includes("mono");

  if (isMono) {
    if (isBold && isItalic) return StandardFonts.CourierBoldOblique;
    if (isBold) return StandardFonts.CourierBold;
    if (isItalic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (isSerif) {
    if (isBold && isItalic) return StandardFonts.TimesRomanBoldItalic;
    if (isBold) return StandardFonts.TimesRomanBold;
    if (isItalic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (isBold && isItalic) return StandardFonts.HelveticaBoldOblique;
  if (isBold) return StandardFonts.HelveticaBold;
  if (isItalic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

// ─── Glyph Safety ───────────────────────────────────────────────────────────

/**
 * Validates every character in `text` against the font's supported character set.
 * Returns null if all characters are supported, or a descriptive error string
 * identifying the first unsupported character.
 */
export function validateGlyphCoverage(font: any, text: string): string | null {
  let charSet: Set<number>;
  try {
    const arr: number[] = font.getCharacterSet();
    charSet = new Set(arr);
  } catch {
    // If getCharacterSet() isn't available, fall back to trying encodeText
    try {
      font.encodeText(text);
      return null;
    } catch (e: any) {
      return `Font cannot encode text: ${e.message || e}`;
    }
  }

  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (!charSet.has(cp)) {
      const char = String.fromCodePoint(cp);
      const hex = cp.toString(16).toUpperCase().padStart(4, "0");
      return `Character '${char}' (U+${hex}) at position ${i} is not supported by the replacement font. Standard PDF fonts only support WinAnsi Latin characters.`;
    }
    if (cp > 0xFFFF) i++; // skip surrogate pair
  }
  return null;
}

// ─── Color Sampling ─────────────────────────────────────────────────────────

/**
 * Samples background and glyph colors from a rendered canvas at the given
 * PDF bounding box coordinates.
 *
 * canvas.width/height = physical pixel dimensions (includes DPR * scale).
 * pdfWidth/pdfHeight = unscaled PDF page size in points.
 */
export function sampleColorsFromCanvas(
  canvas: HTMLCanvasElement,
  pdfWidth: number,
  pdfHeight: number,
  box: { x: number; y: number; width: number; height: number }
): { color: [number, number, number]; bgColor: [number, number, number] } {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { color: [0, 0, 0], bgColor: [1, 1, 1] };

  const scaleX = canvas.width / pdfWidth;
  const scaleY = canvas.height / pdfHeight;

  // PDF origin = bottom-left, Canvas origin = top-left.
  const cx = Math.floor(box.x * scaleX);
  const cy = Math.floor((pdfHeight - box.y - box.height) * scaleY);
  const cw = Math.max(2, Math.floor(box.width * scaleX));
  const ch = Math.max(2, Math.floor(box.height * scaleY));

  try {
    const safeX = Math.max(0, Math.min(cx, canvas.width - 1));
    const safeY = Math.max(0, Math.min(cy, canvas.height - 1));
    const safeW = Math.min(cw, canvas.width - safeX);
    const safeH = Math.min(ch, canvas.height - safeY);
    if (safeW <= 0 || safeH <= 0) return { color: [0, 0, 0], bgColor: [1, 1, 1] };

    const imgData = ctx.getImageData(safeX, safeY, safeW, safeH);
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;

    // Background: corners + edge midpoints
    const edgeSamples = [
      { x: 0, y: 0 }, { x: w - 1, y: 0 },
      { x: 0, y: h - 1 }, { x: w - 1, y: h - 1 },
      { x: Math.floor(w / 2), y: 0 }, { x: Math.floor(w / 2), y: h - 1 },
      { x: 0, y: Math.floor(h / 2) }, { x: w - 1, y: Math.floor(h / 2) },
    ];

    let bgR = 0, bgG = 0, bgB = 0, bgN = 0;
    edgeSamples.forEach(({ x, y }) => {
      const i = (y * w + x) * 4;
      if (i >= 0 && i < data.length - 3) {
        bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2]; bgN++;
      }
    });

    const bgColor: [number, number, number] = bgN > 0
      ? [bgR / bgN / 255, bgG / bgN / 255, bgB / bgN / 255]
      : [1, 1, 1];

    // Glyph color: pixels most different from background
    const bgRv = bgColor[0] * 255, bgGv = bgColor[1] * 255, bgBv = bgColor[2] * 255;
    let tR = 0, tG = 0, tB = 0, tN = 0;
    let bestR = 0, bestG = 0, bestB = 0, maxDist = -1;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const d = (r - bgRv) ** 2 + (g - bgGv) ** 2 + (b - bgBv) ** 2;
      if (d > maxDist) { maxDist = d; bestR = r; bestG = g; bestB = b; }
      if (d > 1500) { tR += r; tG += g; tB += b; tN++; }
    }

    const textColor: [number, number, number] = tN > 0
      ? [tR / tN / 255, tG / tN / 255, tB / tN / 255]
      : [bestR / 255, bestG / 255, bestB / 255];

    return { color: textColor, bgColor };
  } catch (e) {
    console.error("[textEdit] sampleColorsFromCanvas error:", e);
    return { color: [0, 0, 0], bgColor: [1, 1, 1] };
  }
}

// ─── Export: apply edits to PDF binary ──────────────────────────────────────

/**
 * Applies all pending edits to the PDF file using pdf-lib.
 *
 * Architecture: Redact → Redraw (corrected overlay approach).
 *
 * In-place content-stream substitution was investigated and found infeasible:
 * pdf-lib's PDFContentStream only supports creation from operator arrays —
 * there is no API to parse existing page content streams back into editable
 * operator lists. PDFPageLeaf.Contents() returns raw PDFStream bytes with no
 * parsing support.
 *
 * Font safety: uses StandardFonts exclusively (never reuses the page's
 * embedded/subsetted fonts). Every character is validated against the font's
 * character set before drawing. Unsupported characters produce a thrown error
 * rather than silent .notdef glyphs.
 */
export async function applyTextEditsToPDF(
  file: File,
  edits: Record<string, TextEditData>,
  styles: Record<string, any>
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  // Group edits by page
  const editsByPage: Record<number, Record<number, TextEditData>> = {};
  for (const key of Object.keys(edits)) {
    const [piStr, iiStr] = key.split("-");
    const pi = parseInt(piStr), ii = parseInt(iiStr);
    if (!editsByPage[pi]) editsByPage[pi] = {};
    editsByPage[pi][ii] = edits[key];
  }

  const pages = pdfDoc.getPages();
  const fontCache: Record<string, any> = {};

  for (let pi = 0; pi < pages.length; pi++) {
    const pageEdits = editsByPage[pi];
    if (!pageEdits) continue;
    const page = pages[pi];

    for (const iiStr of Object.keys(pageEdits)) {
      const edit = pageEdits[parseInt(iiStr)];
      const item = edit.originalItem;

      const x = item.transform[4];
      const y = item.transform[5];
      const fontSize = Math.abs(item.transform[3]);
      const w = item.width;
      const h = item.height || fontSize;

      // ── Step B: Embed standard font (never reuse subsetted page font) ──
      const styleObj = styles[item.fontName] || {};
      const stdName = getStandardFontName(styleObj.fontFamily || "", item.fontName);
      if (!fontCache[stdName]) {
        fontCache[stdName] = await pdfDoc.embedFont(stdName);
      }
      const font = fontCache[stdName];

      // ── Glyph safety: validate BEFORE drawing ──
      const glyphError = validateGlyphCoverage(font, edit.newText);
      if (glyphError) {
        throw new Error(
          `Cannot export: ${glyphError}\n` +
          `Original text: "${item.str}" → New text: "${edit.newText}"`
        );
      }

      // ── 1. Redact: opaque rectangle with sampled background color ──
      // Extend below baseline for descenders, above for ascenders
      const pad = fontSize * 0.3;
      page.drawRectangle({
        x,
        y: y - pad,
        width: w,
        height: h + pad * 2,
        color: rgb(edit.bgColor[0], edit.bgColor[1], edit.bgColor[2]),
        borderWidth: 0,
      });

      // ── 2. Redraw: new text with horizontal scaling to fit ──
      const measuredW = font.widthOfTextAtSize(edit.newText, fontSize);
      let hScale = 1.0;
      if (w > 0 && measuredW > 0 && Math.abs(measuredW - w) / w > 0.15) {
        hScale = w / measuredW;
      }

      if (hScale !== 1.0) {
        page.pushOperators(
          PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [
            PDFNumber.of(Math.round(hScale * 100)),
          ])
        );
      }

      page.drawText(edit.newText, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(edit.color[0], edit.color[1], edit.color[2]),
      });

      if (hScale !== 1.0) {
        page.pushOperators(
          PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(100)])
        );
      }
    }
  }

  return pdfDoc.save({ useObjectStreams: true });
}
