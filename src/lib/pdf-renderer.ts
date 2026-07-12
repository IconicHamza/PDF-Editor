import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";

let pdfjsLib: any = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist");
    // Dynamically determine the basePath for both local dev and GitHub Pages
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
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
  
  // For thumbnails (small scales), use a lower pixel ratio to save memory on mobile
  const pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 2) : 2;
  const renderScale = baseScale * pixelRatio;
  
  const logicalViewport = page.getViewport({ scale: baseScale });
  const renderViewport = page.getViewport({ scale: renderScale });
  
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get canvas context");
  
  // Set the actual physical pixels of the canvas
  canvas.width = renderViewport.width;
  canvas.height = renderViewport.height;
  
  // Use CSS to constrain to logical size - use max-width so it's responsive
  canvas.style.width = `${Math.floor(logicalViewport.width)}px`;
  canvas.style.height = `${Math.floor(logicalViewport.height)}px`;
  canvas.style.maxWidth = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${logicalViewport.width} / ${logicalViewport.height}`;
  
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
  
  // For offscreen canvases, render at a fixed scale without CSS tricks
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  
  const renderTask = page.render({ canvasContext: ctx, viewport });
  await renderTask.promise;
  
  const dataUrl = canvas.toDataURL("image/png");
  await pdfDoc.destroy();
  return dataUrl;
}
