import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";

let pdfjsLib: any = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/PDF-Editor/pdf.worker.min.mjs";
  }
  return pdfjsLib;
}

export async function loadPDF(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  
  const task = pdfjs.getDocument({ 
    data: new Uint8Array(arrayBuffer),
    disableWorker: true,
  });
  
  return await task.promise;
}

export async function getPageCount(file: File): Promise<number> {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  return pdf.getPageCount();
}

export async function getPdfInfo(file: File): Promise<{ pageCount: number; firstPageSize: { width: number; height: number } }> {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const firstPage = pdf.getPage(0);
  const { width, height } = firstPage.getSize();

  return {
    pageCount: pdf.getPageCount(),
    firstPageSize: { width, height },
  };
}

export async function renderPageToCanvas(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  baseScale: number = 1.0
): Promise<void> {
  const page = await pdfDoc.getPage(pageNumber);
  
  // To ensure the PDF renders crystal-clear on High-DPI/Retina screens, we multiply the scale.
  // We use devicePixelRatio, defaulting to 2 for crisp textures.
  const pixelRatio = typeof window !== 'undefined' ? (window.devicePixelRatio || 2) : 2;
  const renderScale = baseScale * pixelRatio;
  
  // We get two viewports: one for visual layout, one for high-res drawing
  const logicalViewport = page.getViewport({ scale: baseScale });
  const renderViewport = page.getViewport({ scale: renderScale });
  
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get canvas context");
  
  // Set the actual physical pixels of the canvas array (High Resolution)
  canvas.height = renderViewport.height;
  canvas.width = renderViewport.width;
  
  // Force the CSS layout parser to constrain the canvas to the logical 1x scale!
  canvas.style.width = `${Math.floor(logicalViewport.width)}px`;
  canvas.style.height = `${Math.floor(logicalViewport.height)}px`;
  
  const renderContext = {
    canvasContext: context,
    viewport: renderViewport,
    canvas: canvas,
  };
  
  try {
    const renderTask = page.render(renderContext);
    await renderTask.promise;
  } catch (err) {
    console.error(`pdfjs-dist renderPageToCanvas failed for page ${pageNumber}:`, err);
    throw err;
  }
}

// Render a specific page of a PDF File (returns a Data URL for an Image or thumbnail)
export async function getPageThumbnailDataUrl(
  file: File, 
  pageNumber: number, 
  scale: number = 0.3
): Promise<string> {
  const pdfDoc = await loadPDF(file);
  const canvas = document.createElement("canvas");
  await renderPageToCanvas(pdfDoc, pageNumber, canvas, scale);
  
  const dataUrl = canvas.toDataURL("image/png");
  // Clean up
  await pdfDoc.destroy();
  return dataUrl;
}
