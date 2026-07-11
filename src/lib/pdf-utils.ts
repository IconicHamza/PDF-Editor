import { PDFDocument, rgb, degrees, StandardFonts, PDFName } from "pdf-lib";

/**
 * Merge multiple PDF files together
 */
export async function mergePDFs(files: File[], onProgress?: (p: number) => void): Promise<Uint8Array> {
  if (files.length < 2) throw new Error("At least two PDF files are required to merge.");

  const mergedPdf = await PDFDocument.create();
  const total = files.length;
  
  for (let i = 0; i < total; i++) {
    const file = files[i];
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    
    copiedPages.forEach((page) => mergedPdf.addPage(page));
    
    if (onProgress) onProgress(((i + 1) / total) * 100);
  }
  
  if (mergedPdf.getPageCount() === 0) throw new Error("The selected PDFs did not contain any pages.");

  return await mergedPdf.save({ useObjectStreams: true });
}

/**
 * Extract specific pages to create a new PDF
 */
export async function splitPDF(file: File, pageIndices: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfToSplit = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  
  const newPdf = await PDFDocument.create();
  // Valid indices only
  const validIndices: number[] = [];
  const pageCount = pdfToSplit.getPageCount();

  for (const index of pageIndices) {
    if (Number.isInteger(index) && index >= 0 && index < pageCount) {
      validIndices.push(index);
    }
  }
  if (validIndices.length === 0) throw new Error("Select at least one valid page.");
  
  const copiedPages = await newPdf.copyPages(pdfToSplit, validIndices);
  copiedPages.forEach((page) => newPdf.addPage(page));
  
  return await newPdf.save({ useObjectStreams: true });
}

/**
 * Image to PDF convert
 */
export async function imagesToPDF(files: File[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error("Select at least one image.");

  const pdf = await PDFDocument.create();
  const pageWidth = 595.28; // A4 portrait in PDF points
  const pageHeight = 841.89;
  const margin = 36;
  
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const normalized = await normalizeImageForPdf(file);
    const image = normalized.type === "png"
      ? await pdf.embedPng(normalized.bytes)
      : await pdf.embedJpg(normalized.bytes);

    const page = pdf.addPage();
    page.setSize(pageWidth, pageHeight);
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    });
  }

  return await pdf.save({ useObjectStreams: true });
}

async function normalizeImageForPdf(file: File): Promise<{ bytes: Uint8Array; type: "jpg" | "png" }> {
  const originalBytes = new Uint8Array(await file.arrayBuffer());

  if (file.type === "image/png") {
    return { bytes: originalBytes, type: "png" };
  }

  if (file.type === "image/jpeg" || file.type === "image/jpg") {
    return { bytes: originalBytes, type: "jpg" };
  }

  const dataUrl = await convertDataUrlToJpeg(await fileToDataURL(file));
  return { bytes: dataUrlToBytes(dataUrl), type: "jpg" };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64Data = dataUrl.split(",")[1];
  if (!base64Data) throw new Error("Invalid image data URL");

  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i += 1) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return bytes;
}

/**
 * Basic PDF Compression over pdf-lib
 */
export async function compressPDF(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const originalPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  
  // Create a new document and copy pages to drop any unreferenced objects (garbage collection)
  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(originalPdf, originalPdf.getPageIndices());
  copiedPages.forEach((page) => newPdf.addPage(page));
  
  newPdf.setTitle("");
  newPdf.setAuthor("");
  newPdf.setSubject("");
  newPdf.setCreator("");
  newPdf.setProducer("");
  
  return await newPdf.save({ useObjectStreams: true });
}

/**
 * Extreme PDF Compression (Rasterization)
 * Converts each page to a JPEG image at the specified quality (0.1 to 1.0)
 * and scale, then reconstructs the PDF.
 */
export async function compressPDFExtreme(
  file: File, 
  quality: number, // 0.1 (extreme) to 1.0 (lossless-ish)
  onProgress?: (p: number) => void
): Promise<Uint8Array> {
  // We dynamically import pdf-renderer so it doesn't break SSR if used server-side
  const { loadPDF, renderPageToCanvas } = await import("./pdf-renderer");
  
  const pdfjsDoc = await loadPDF(file);
  const totalPages = pdfjsDoc.numPages;
  const newPdf = await PDFDocument.create();
  
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfjsDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    
    // Scale down resolution based on quality.
    // A scale of 1.0 is roughly 72dpi. To keep text legible, we should not drop below 1.5.
    // quality goes from 0.1 (extreme) to 1.0 (lossless-ish).
    // renderScale will range from 1.65 (extreme) to 3.0 (high quality).
    const renderScale = 1.5 + (quality * 1.5); 
    
    const canvas = document.createElement("canvas");
    await renderPageToCanvas(pdfjsDoc, i, canvas, renderScale / (window.devicePixelRatio || 2)); 
    
    // JPEG quality shouldn't drop below 0.6 to avoid heavy artifacting
    // jpegQuality will range from 0.64 (extreme) to 1.0 (high quality).
    const jpegQuality = 0.6 + (quality * 0.4);
    const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
    
    // Convert to bytes
    const base64Data = dataUrl.split(",")[1];
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let j = 0; j < binaryStr.length; j++) {
      bytes[j] = binaryStr.charCodeAt(j);
    }
    
    // Embed and draw on new PDF
    const image = await newPdf.embedJpg(bytes);
    const pdfPage = newPdf.addPage([viewport.width, viewport.height]);
    
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
    
    if (onProgress) {
      onProgress((i / totalPages) * 100);
    }
  }
  
  return await newPdf.save({ useObjectStreams: true });
}

/**
 * Remove common document metadata before sharing a PDF.
 */
export async function sanitizePDF(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  pdf.setTitle("");
  pdf.setAuthor("");
  pdf.setSubject("");
  pdf.setKeywords([]);
  pdf.setCreator("PaperDesk");
  pdf.setProducer("PaperDesk");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date());

  return await pdf.save({ useObjectStreams: true });
}

export interface WatermarkOptions {
  text: string;
  opacity: number;
  rotation: number;
  color: [number, number, number]; // RGB array 0-1
  fontSize: number;
  // Optional position in PDF coordinates (origin = bottom-left)
  // If not provided, watermark is centered on each page
  x?: number;
  y?: number;
}

/**
 * Add text Watermark to all pages
 * Position is in PDF coordinate space (origin bottom-left, y goes up).
 * The UI provides position as top-left origin, so caller must convert.
 */
export async function addWatermark(file: File, options: WatermarkOptions): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const pages = pdfDoc.getPages();
  const { text, opacity, rotation, color, fontSize } = options;
  
  pages.forEach(page => {
    const { width, height } = page.getSize();
    const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
    const textHeight = helveticaFont.heightAtSize(fontSize);
    
    // UI passes x,y as the exact center of the text.
    const centerX = options.x !== undefined ? options.x : (width / 2);
    const centerY = options.y !== undefined ? options.y : (height / 2);
    
    // Convert degrees to radians for JS Math
    const rad = (options.rotation * Math.PI) / 180;
    
    // Vector from center to bottom-left corner of unrotated text
    const dx = -textWidth / 2;
    // For text in pdf-lib, the y-coordinate is the baseline, 
    // which is near the bottom. To center vertically exactly, we offset half the cap height.
    const dy = -textHeight / 3; 
    
    // Rotate this vector by the specified angle
    const rotatedDx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const rotatedDy = dx * Math.sin(rad) + dy * Math.cos(rad);
    
    // The final draw origin (bottom-left rotated anchor)
    const drawX = centerX + rotatedDx;
    const drawY = centerY + rotatedDy;
    
    page.drawText(text, {
      x: drawX,
      y: drawY,
      size: fontSize,
      font: helveticaFont,
      color: rgb(color[0], color[1], color[2]),
      opacity: opacity,
      rotate: degrees(options.rotation),
    });
  });
  
  return await pdfDoc.save({ useObjectStreams: true });
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeImageForJsPdf(dataUrl: string, mimeType: string): Promise<string> | string {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png") {
    return dataUrl;
  }

  return convertDataUrlToJpeg(dataUrl);
}

/**
 * Add an image (signature) to a specific page
 */
export async function signPDF(
  file: File, 
  signatureDataUrl: string, 
  pageIndex: number, 
  bounds: { x: number; y: number; width: number; height: number }
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  
  const pages = pdfDoc.getPages();
  if (pageIndex < 0 || pageIndex >= pages.length) throw new Error("Invalid page index");
  
  const page = pages[pageIndex];
  
  // Extract raw bytes from data URL for more reliable embedding
  const base64Data = signatureDataUrl.split(',')[1];
  if (!base64Data) throw new Error("Invalid signature data URL");
  
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  // Try embedding as PNG first, fall back to converting to JPEG
  let embeddedImage;
  try {
    if (signatureDataUrl.includes('image/png')) {
      embeddedImage = await pdfDoc.embedPng(bytes);
    } else if (signatureDataUrl.includes('image/jpeg') || signatureDataUrl.includes('image/jpg')) {
      embeddedImage = await pdfDoc.embedJpg(bytes);
    } else {
      // Try PNG by default (canvas.toDataURL usually outputs PNG)
      embeddedImage = await pdfDoc.embedPng(bytes);
    }
  } catch (pngError) {
    // If PNG embedding fails, convert to JPEG via canvas and try again
    console.warn("PNG embedding failed, converting to JPEG fallback:", pngError);
    try {
      const jpegDataUrl = await convertDataUrlToJpeg(signatureDataUrl);
      const jpegBase64 = jpegDataUrl.split(',')[1];
      if (!jpegBase64) throw new Error("JPEG conversion failed");
      const jpegBinaryStr = atob(jpegBase64);
      const jpegBytes = new Uint8Array(jpegBinaryStr.length);
      for (let i = 0; i < jpegBinaryStr.length; i++) {
        jpegBytes[i] = jpegBinaryStr.charCodeAt(i);
      }
      embeddedImage = await pdfDoc.embedJpg(jpegBytes);
    } catch (jpegError) {
      console.error("Both PNG and JPEG embedding failed:", jpegError);
      throw new Error("Failed to embed signature image. Please try drawing a new signature.");
    }
  }
  
  // Get page height safely
  let pageHeight: number;
  try {
    pageHeight = page.getHeight();
  } catch {
    // Fallback: try to get from MediaBox directly
    const mediaBox = page.node.get(PDFName.of('MediaBox'));
    if (mediaBox) {
      pageHeight = 842; // A4 fallback
    } else {
      pageHeight = 842;
    }
  }
  
  page.drawImage(embeddedImage, {
    x: bounds.x,
    y: pageHeight - bounds.y - bounds.height,
    width: bounds.width,
    height: bounds.height,
  });
  
  return await pdfDoc.save({ useObjectStreams: true });
}

/**
 * Convert a data URL to JPEG format via an offscreen canvas
 */
function convertDataUrlToJpeg(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("Could not get canvas context")); return; }
      // White background for JPEG (no transparency)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
