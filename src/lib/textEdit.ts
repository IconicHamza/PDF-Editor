import { PDFDocument, rgb, PDFOperator, PDFNumber, StandardFonts, PDFOperatorNames } from "pdf-lib";

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

/**
 * Maps pdfjs font family and name to standard PDF-lib StandardFonts enum values.
 */
export function getStandardFontName(fontFamily: string, fontName: string): StandardFonts {
  const family = (fontFamily || "").toLowerCase();
  const name = (fontName || "").toLowerCase();

  const isBold = family.includes("bold") || name.includes("bold");
  const isItalic =
    family.includes("italic") ||
    family.includes("oblique") ||
    name.includes("italic") ||
    name.includes("oblique");
  const isSerif =
    family.includes("times") ||
    family.includes("serif") ||
    name.includes("times") ||
    name.includes("serif");
  const isMono =
    family.includes("courier") ||
    family.includes("monospace") ||
    family.includes("mono") ||
    name.includes("courier") ||
    name.includes("mono");

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

/**
 * Samples background color and glyph color from a rendered canvas at the given
 * PDF bounding box. The canvas must have been rendered with renderPageToCanvas
 * so that its physical pixel dimensions correspond to a scaled version of the
 * PDF coordinate space.
 *
 * pdfWidth / pdfHeight = unscaled PDF page size in points.
 * canvas.width / canvas.height = actual pixel count (includes devicePixelRatio scaling).
 */
export function sampleColorsFromCanvas(
  canvas: HTMLCanvasElement,
  pdfWidth: number,
  pdfHeight: number,
  box: { x: number; y: number; width: number; height: number }
): { color: [number, number, number]; bgColor: [number, number, number] } {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { color: [0, 0, 0], bgColor: [1, 1, 1] };

  // canvas.width/height are in physical pixels (includes DPR scaling).
  const scaleX = canvas.width / pdfWidth;
  const scaleY = canvas.height / pdfHeight;

  // PDF coords: origin bottom-left. Canvas: origin top-left.
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

    // --- Background: sample corners + edge midpoints (pixels outside glyph bodies) ---
    const edgeSamples: Array<{ x: number; y: number }> = [
      { x: 0, y: 0 },
      { x: w - 1, y: 0 },
      { x: 0, y: h - 1 },
      { x: w - 1, y: h - 1 },
      { x: Math.floor(w / 2), y: 0 },
      { x: Math.floor(w / 2), y: h - 1 },
      { x: 0, y: Math.floor(h / 2) },
      { x: w - 1, y: Math.floor(h / 2) },
    ];

    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
    let bgRsq = 0, bgGsq = 0, bgBsq = 0; // for variance

    edgeSamples.forEach(({ x, y }) => {
      const i = (y * w + x) * 4;
      if (i >= 0 && i < data.length - 3) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        bgR += r; bgG += g; bgB += b;
        bgRsq += r * r; bgGsq += g * g; bgBsq += b * b;
        bgCount++;
      }
    });

    const finalBgColor: [number, number, number] = bgCount > 0
      ? [bgR / bgCount / 255, bgG / bgCount / 255, bgB / bgCount / 255]
      : [1, 1, 1];

    // Check if background is non-uniform (gradient, image behind text).
    // Variance > threshold means the region is complex.
    let isUniform = true;
    if (bgCount > 1) {
      const varR = bgRsq / bgCount - (bgR / bgCount) ** 2;
      const varG = bgGsq / bgCount - (bgG / bgCount) ** 2;
      const varB = bgBsq / bgCount - (bgB / bgCount) ** 2;
      if (varR + varG + varB > 600) isUniform = false; // ~25/255 std-dev threshold
    }

    // If non-uniform background, still use the average — it's the best we can do
    // without image-patch compositing. Log a warning for debugging.
    if (!isUniform) {
      console.debug("[textEdit] Non-uniform background detected; using average color.");
    }

    // --- Glyph color: pixels that differ significantly from the background ---
    const bgRn = finalBgColor[0] * 255;
    const bgGn = finalBgColor[1] * 255;
    const bgBn = finalBgColor[2] * 255;

    let textR = 0, textG = 0, textB = 0, textCount = 0;
    let maxDist = -1;
    let bestR = 0, bestG = 0, bestB = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const dist =
        (r - bgRn) * (r - bgRn) +
        (g - bgGn) * (g - bgGn) +
        (b - bgBn) * (b - bgBn);

      if (dist > maxDist) {
        maxDist = dist;
        bestR = r; bestG = g; bestB = b;
      }
      // Threshold: distance > sqrt(1500) ≈ 38.7 out of 255 per channel
      if (dist > 1500) {
        textR += r; textG += g; textB += b;
        textCount++;
      }
    }

    const finalTextColor: [number, number, number] = textCount > 0
      ? [textR / textCount / 255, textG / textCount / 255, textB / textCount / 255]
      : [bestR / 255, bestG / 255, bestB / 255];

    return { color: finalTextColor, bgColor: finalBgColor };
  } catch (e) {
    console.error("[textEdit] sampleColorsFromCanvas failed:", e);
    return { color: [0, 0, 0], bgColor: [1, 1, 1] };
  }
}

/**
 * Composites all pending edits onto an offscreen canvas (for Preview Mode).
 * Each edit: (1) erase original text with bg-color rect, (2) draw new text.
 * Returns a data-URL PNG of the composited result.
 *
 * sourceCanvas: the pdfjs-rendered canvas (pixel dimensions match pdfWidth/pdfHeight * scale * DPR).
 * pdfWidth / pdfHeight: unscaled PDF coordinate space.
 * edits: map of edits for this page only (keys are `${pageIndex}-${itemIndex}`).
 * styles: pdfjs text styles map (fontFamily per fontName).
 * pageIndex: which page (0-based) to filter edits for.
 */
export async function compositeEditsToCanvas(
  sourceCanvas: HTMLCanvasElement,
  pdfWidth: number,
  pdfHeight: number,
  editsForPage: Record<number, TextEditData>,
  styles: Record<string, any>
): Promise<void> {
  const ctx = sourceCanvas.getContext("2d");
  if (!ctx) return;

  const scaleX = sourceCanvas.width / pdfWidth;
  const scaleY = sourceCanvas.height / pdfHeight;

  for (const itemIndexStr in editsForPage) {
    const edit = editsForPage[itemIndexStr];
    const item = edit.originalItem;

    const pdfX = item.transform[4];
    const pdfY = item.transform[5];
    const fontHeightPt = Math.abs(item.transform[3]);
    const widthPt = item.width;
    const heightPt = item.height || fontHeightPt;

    // Convert PDF points → canvas pixels (flip Y axis)
    const canvasX = pdfX * scaleX;
    // PDF baseline y → canvas top-left y. Add small descent padding (20% of height).
    const descentPad = heightPt * 0.25 * scaleY;
    const canvasY = (pdfHeight - pdfY - heightPt) * scaleY - descentPad;
    const canvasW = widthPt * scaleX;
    const canvasH = (heightPt + heightPt * 0.25) * scaleY;

    // 1. Redact: fill with sampled background color
    const [bgR, bgG, bgB] = edit.bgColor;
    ctx.fillStyle = `rgb(${Math.round(bgR * 255)},${Math.round(bgG * 255)},${Math.round(bgB * 255)})`;
    ctx.fillRect(canvasX, canvasY, canvasW, canvasH);

    // 2. Redraw: render replacement text
    const styleObj = styles[item.fontName] || {};
    const fontFamily = styleObj.fontFamily || "sans-serif";
    const isBold = fontFamily.toLowerCase().includes("bold") || item.fontName.toLowerCase().includes("bold");
    const isItalic =
      fontFamily.toLowerCase().includes("italic") ||
      fontFamily.toLowerCase().includes("oblique") ||
      item.fontName.toLowerCase().includes("italic");

    // Font size in canvas pixels (same ratio as PDF points → canvas)
    const fontSizePx = fontHeightPt * scaleY;
    const fontStr = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${fontSizePx}px ${fontFamily}`;

    ctx.save();
    ctx.font = fontStr;

    // Horizontal scale: if new text width differs > 15%, compress/stretch to fit
    const measuredW = ctx.measureText(edit.newText).width;
    let hScale = 1.0;
    if (canvasW > 0 && measuredW > 0 && Math.abs(measuredW - canvasW) / canvasW > 0.15) {
      hScale = canvasW / measuredW;
    }

    const [tR, tG, tB] = edit.color;
    ctx.fillStyle = `rgb(${Math.round(tR * 255)},${Math.round(tG * 255)},${Math.round(tB * 255)})`;

    // Baseline position: PDF y → canvas y, align text to baseline
    const baselineY = (pdfHeight - pdfY) * scaleY;

    ctx.setTransform(hScale, 0, 0, 1, canvasX * (1 - hScale), 0);
    ctx.fillText(edit.newText, canvasX, baselineY);
    ctx.restore();
  }
}

/**
 * Applies edits to the actual PDF binary using pdf-lib.
 * Detect → Redact → Redraw pattern for each edited text run.
 */
export async function applyTextEditsToPDF(
  file: File,
  edits: Record<string, TextEditData>,
  styles: Record<string, any>
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  // Group edits by pageIndex
  const editsByPage: Record<number, Record<number, TextEditData>> = {};
  Object.keys(edits).forEach((key) => {
    const [pageIndexStr, itemIndexStr] = key.split("-");
    const pageIndex = parseInt(pageIndexStr);
    const itemIndex = parseInt(itemIndexStr);
    if (!editsByPage[pageIndex]) editsByPage[pageIndex] = {};
    editsByPage[pageIndex][itemIndex] = edits[key];
  });

  const pages = pdfDoc.getPages();

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageEdits = editsByPage[pageIndex];
    if (!pageEdits) continue;

    const page = pages[pageIndex];
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // Embed fonts once per page (cache by StandardFonts name)
    const fontCache: Record<string, any> = {};

    for (const itemIndexStr in pageEdits) {
      const edit = pageEdits[itemIndexStr];
      const item = edit.originalItem;

      const x = item.transform[4];
      const y = item.transform[5];
      const fontHeightPt = Math.abs(item.transform[3]);
      const widthPt = item.width;
      const heightPt = item.height || fontHeightPt;

      // 1. Redact: opaque rectangle with sampled background color
      //    y in pdf-lib = bottom of rectangle. Add descent padding below baseline.
      const rectY = y - heightPt * 0.25;
      const rectH = heightPt * 1.25;
      page.drawRectangle({
        x,
        y: rectY,
        width: widthPt,
        height: rectH,
        color: rgb(edit.bgColor[0], edit.bgColor[1], edit.bgColor[2]),
        borderWidth: 0,
      });

      // 2. Redraw: standard font at matching size
      const styleObj = styles[item.fontName] || {};
      const fontFamily = styleObj.fontFamily || "";
      const standardFontName = getStandardFontName(fontFamily, item.fontName);

      if (!fontCache[standardFontName]) {
        fontCache[standardFontName] = await pdfDoc.embedFont(standardFontName);
      }
      const font = fontCache[standardFontName];

      // Horizontal scale to fit original bounding box width
      const standardW = font.widthOfTextAtSize(edit.newText, fontHeightPt);
      let hScale = 1.0;
      if (widthPt > 0 && standardW > 0 && Math.abs(standardW - widthPt) / widthPt > 0.15) {
        hScale = widthPt / standardW;
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
        size: fontHeightPt,
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
