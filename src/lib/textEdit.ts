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
  color: [number, number, number]; // RGB 0-1
  bgColor: [number, number, number]; // RGB 0-1
}

/**
 * Maps pdfjs font family and name to standard PDF-lib fonts
 */
export function getStandardFontName(fontFamily: string, fontName: string): StandardFonts {
  const family = (fontFamily || "").toLowerCase();
  const name = (fontName || "").toLowerCase();
  
  const isBold = family.includes("bold") || name.includes("bold");
  const isItalic = family.includes("italic") || family.includes("oblique") || name.includes("italic") || name.includes("oblique");
  const isSerif = family.includes("times") || family.includes("serif") || name.includes("times") || name.includes("serif");
  const isMono = family.includes("courier") || family.includes("monospace") || family.includes("mono") || name.includes("courier") || name.includes("mono");

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
  
  // Default to Helvetica/Arial (sans-serif)
  if (isBold && isItalic) return StandardFonts.HelveticaBoldOblique;
  if (isBold) return StandardFonts.HelveticaBold;
  if (isItalic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/**
 * Samples text and background color from a rendered canvas at the given PDF bounding box coordinates
 */
export function sampleColorsFromCanvas(
  canvas: HTMLCanvasElement,
  pdfWidth: number,
  pdfHeight: number,
  box: { x: number; y: number; width: number; height: number }
): { color: [number, number, number]; bgColor: [number, number, number] } {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { color: [0, 0, 0], bgColor: [1, 1, 1] }; // Default black text, white bg
  }

  const scaleX = canvas.width / pdfWidth;
  const scaleY = canvas.height / pdfHeight;

  // Convert PDF coordinates to Canvas pixels
  // Note: PDF y starts at bottom-left, Canvas y starts at top-left
  const cx = Math.floor(box.x * scaleX);
  const cy = Math.floor((pdfHeight - box.y - box.height) * scaleY);
  const cw = Math.max(1, Math.floor(box.width * scaleX));
  const ch = Math.max(1, Math.floor(box.height * scaleY));

  try {
    const imgData = ctx.getImageData(
      Math.max(0, Math.min(cx, canvas.width - 1)),
      Math.max(0, Math.min(cy, canvas.height - 1)),
      Math.min(cw, canvas.width - cx),
      Math.min(ch, canvas.height - cy)
    );

    const data = imgData.data;
    const len = data.length;

    // Sample background: average of corner and edge middle pixels
    let bgR = 0, bgG = 0, bgB = 0;
    let bgSamples = 0;

    const corners = [
      { x: 0, y: 0 },
      { x: cw - 1, y: 0 },
      { x: 0, y: ch - 1 },
      { x: cw - 1, y: ch - 1 },
      { x: Math.floor(cw / 2), y: 0 },
      { x: Math.floor(cw / 2), y: ch - 1 },
    ];

    corners.forEach(c => {
      if (c.x >= 0 && c.x < cw && c.y >= 0 && c.y < ch) {
        const idx = (c.y * cw + c.x) * 4;
        if (idx >= 0 && idx < len - 3) {
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
          bgSamples++;
        }
      }
    });

    const finalBgColor: [number, number, number] = bgSamples > 0 
      ? [bgR / bgSamples / 255, bgG / bgSamples / 255, bgB / bgSamples / 255]
      : [1, 1, 1]; // Default white

    // Sample text color: find pixel with highest distance from background color
    let maxDist = -1;
    let bestPixel = { r: 0, g: 0, b: 0 };
    let textR = 0, textG = 0, textB = 0;
    let textSamples = 0;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const dist = Math.pow(r - finalBgColor[0] * 255, 2) +
                   Math.pow(g - finalBgColor[1] * 255, 2) +
                   Math.pow(b - finalBgColor[2] * 255, 2);

      if (dist > maxDist) {
        maxDist = dist;
        bestPixel = { r, g, b };
      }

      // If the pixel is significantly different from the background, accumulate it
      if (dist > 1500) {
        textR += r;
        textG += g;
        textB += b;
        textSamples++;
      }
    }

    const finalTextColor: [number, number, number] = textSamples > 0
      ? [textR / textSamples / 255, textG / textSamples / 255, textB / textSamples / 255]
      : [bestPixel.r / 255, bestPixel.g / 255, bestPixel.b / 255];

    return {
      color: finalTextColor,
      bgColor: finalBgColor,
    };
  } catch (e) {
    console.error("Failed to sample colors from canvas:", e);
    return { color: [0, 0, 0], bgColor: [1, 1, 1] };
  }
}

/**
 * Applies the edits dictionary (Detect -> Redact -> Redraw) to a PDF using pdf-lib
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
  Object.keys(edits).forEach(key => {
    const [pageIndexStr, itemIndexStr] = key.split("-");
    const pageIndex = parseInt(pageIndexStr);
    const itemIndex = parseInt(itemIndexStr);
    if (!editsByPage[pageIndex]) {
      editsByPage[pageIndex] = {};
    }
    editsByPage[pageIndex][itemIndex] = edits[key];
  });

  const pages = pdfDoc.getPages();

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageEdits = editsByPage[pageIndex];
    if (!pageEdits) continue;

    const page = pages[pageIndex];
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // Group items by font to embed standard fonts only once per page
    const fontCache: Record<string, any> = {};

    for (const itemIndex in pageEdits) {
      const edit = pageEdits[itemIndex];
      const item = edit.originalItem;
      
      const x = item.transform[4];
      const y = item.transform[5];
      const fontHeight = item.transform[3];
      const fontWidth = item.transform[0];
      const itemWidth = item.width;
      const itemHeight = item.height || fontHeight; // fallback if height is 0

      // 1. Redact: Draw opaque background rectangle to hide the original text
      page.drawRectangle({
        x: x,
        y: y, // start redaction at the baseline (or slightly below to cover descent)
        width: itemWidth,
        height: itemHeight,
        color: rgb(edit.bgColor[0], edit.bgColor[1], edit.bgColor[2]),
      });

      // 2. Redraw: Embed standard font and draw replacement text
      const style = styles[item.fontName] || {};
      const fontFamily = style.fontFamily || "";
      const standardFontName = getStandardFontName(fontFamily, item.fontName);
      
      if (!fontCache[standardFontName]) {
        fontCache[standardFontName] = await pdfDoc.embedFont(standardFontName);
      }
      const font = fontCache[standardFontName];

      // Calculate new text width at standard font size
      const standardTextWidth = font.widthOfTextAtSize(edit.newText, fontHeight);
      
      // Calculate horizontal scaling factor if new width differs significantly from the original bounding box
      let horizontalScale = 1.0;
      if (itemWidth > 0 && Math.abs(standardTextWidth - itemWidth) / itemWidth > 0.15) {
        horizontalScale = itemWidth / standardTextWidth;
      }

      // Draw the new text run
      if (horizontalScale !== 1.0) {
        // Set Character Squeeze (Tz horizontal scale operator) in PDF Text state
        page.pushOperators(
          PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(Math.round(horizontalScale * 100))])
        );
      }

      page.drawText(edit.newText, {
        x: x,
        y: y,
        size: fontHeight,
        font: font,
        color: rgb(edit.color[0], edit.color[1], edit.color[2]),
      });

      if (horizontalScale !== 1.0) {
        // Reset Character Squeeze back to 100%
        page.pushOperators(PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(100)]));
      }
    }
  }

  return await pdfDoc.save({ useObjectStreams: true });
}
