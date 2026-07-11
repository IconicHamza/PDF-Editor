"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { signPDF } from "@/lib/pdf-utils";
import { downloadFile } from "@/lib/download";
import { getPdfInfo, renderPageToCanvas, loadPDF } from "@/lib/pdf-renderer";
import { motion, AnimatePresence } from "framer-motion";
import { PenTool, Undo2, ChevronLeft, ChevronRight, X } from "lucide-react";

export default function SignPDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // PDF Preview State
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [canvasDisplaySize, setCanvasDisplaySize] = useState({ width: 0, height: 0 });

  // Signature drawing state
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Position as percentage of page (0-1), resolution-independent
  const [posPercent, setPosPercent] = useState({ x: 0.6, y: 0.7 });
  const sigSize = { width: 150, height: 50 }; // PDF-space size
  
  // Note: We deliberately do not destroy the pdfDoc on unmount 
  // because React 18 StrictMode immediately unmounts and remounts components, 
  // which would permanently kill the PDFProxy instance in state. 
  // We destroy explicitly when the user loads a new file or clicks Cancel.

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];

    try {
      // Destroy previous doc if any
      if (pdfDoc) await pdfDoc.destroy().catch(() => {});

      const info = await getPdfInfo(selectedFile);
      setPdfDoc(null);
      setFile(selectedFile);
      setPageCount(info.pageCount);
      setPdfDimensions(info.firstPageSize);
      setCurrentPage(1);
      setSignatureData(null);
      setPosPercent({ x: 0.6, y: 0.7 });

      loadPDF(selectedFile)
        .then((doc) => setPdfDoc(doc))
        .catch((error) => console.warn("Preview rendering is unavailable for this PDF:", error));
    } catch(err) {
      console.error("Error loading PDF:", err);
      alert("Error loading PDF. The file may be corrupted.");
    }
  };

  // Render page to canvas
  useEffect(() => {
    let active = true;
    if (!pdfDoc || !canvasElement) return;
    const render = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1 });
        setPdfDimensions({ width: viewport.width, height: viewport.height });

        if (active && canvasElement) {
          await renderPageToCanvas(pdfDoc, currentPage, canvasElement, 1);
          // Measure displayed canvas size
          requestAnimationFrame(() => {
            if (canvasElement) {
              const rect = canvasElement.getBoundingClientRect();
              setCanvasDisplaySize({ width: rect.width, height: rect.height });
            }
          });
        }
      } catch (err) {
        console.error("Error rendering page:", err);
      }
    };
    render();
    return () => { active = false; };
  }, [pdfDoc, currentPage, canvasElement]);

  // Update canvas display size on resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasElement) {
        const rect = canvasElement.getBoundingClientRect();
        setCanvasDisplaySize({ width: rect.width, height: rect.height });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [canvasElement]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000000";

    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = ("touches" in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = ("touches" in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  const saveSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    setSignatureData(canvas.toDataURL("image/png"));
  };

  const handleApplySignature = async () => {
    if (!file || !signatureData) return;
    setIsProcessing(true);
    
    try {
      // Convert percent position to PDF coordinates
      const pdfX = posPercent.x * pdfDimensions.width - sigSize.width / 2;
      const pdfY = posPercent.y * pdfDimensions.height - sigSize.height / 2;
      
      const signed = await signPDF(file, signatureData, currentPage - 1, {
        x: Math.max(0, pdfX),
        y: Math.max(0, pdfY),
        width: sigSize.width,
        height: sigSize.height,
      });
      downloadFile(signed, `Signed_${file.name}`);
    } catch(err) {
      console.error("Signature error:", err);
      alert("Failed to apply signature. Please try with a different PDF or redraw the signature.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Draggable Signature Overlay
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingNode(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: posPercent.x,
      startY: posPercent.y,
    };
  }, [posPercent]);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (!isDraggingNode || !canvasElement) return;
    
    const rect = canvasElement.getBoundingClientRect();
    
    const deltaX = (e.clientX - dragStartRef.current.mouseX) / rect.width;
    const deltaY = (e.clientY - dragStartRef.current.mouseY) / rect.height;
    
    const newX = Math.max(0, Math.min(1, dragStartRef.current.startX + deltaX));
    const newY = Math.max(0, Math.min(1, dragStartRef.current.startY + deltaY));

    setPosPercent({ x: newX, y: newY });
  }, [isDraggingNode]);

  const handleDragEnd = useCallback(() => {
    setIsDraggingNode(false);
  }, []);

  const handleCancel = () => {
    if (pdfDoc) pdfDoc.destroy().catch(() => {});
    setPdfDoc(null);
    setFile(null);
    setSignatureData(null);
  };

  // Compute overlay style for the signature box
  const getOverlayStyle = () => {
    if (canvasDisplaySize.width === 0) return { display: "none" as const };
    
    // Scale signature size from PDF coords to display coords
    const scaleX = canvasDisplaySize.width / pdfDimensions.width;
    const scaleY = canvasDisplaySize.height / pdfDimensions.height;
    const displayW = sigSize.width * scaleX;
    const displayH = sigSize.height * scaleY;
    
    return {
      left: `${posPercent.x * 100}%`,
      top: `${posPercent.y * 100}%`,
      transform: 'translate(-50%, -50%)',
      width: `${displayW}px`,
      height: `${displayH}px`,
    };
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-8 pl-2 border-l-4 border-primary/50">
        <h2 className="text-2xl font-bold">Sign PDF</h2>
        <p className="text-secondary opacity-80 mt-1">
          Draw your signature and place it on any page of your document.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div key="upload" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <FileDropZone onFilesSelected={handleFileSelected} multiple={false} />
          </motion.div>
        ) : (
          <motion.div key="editor" initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col lg:flex-row gap-8">
            
            {/* Left: Signature Creator */}
            <div className="w-full lg:w-80 flex flex-col gap-6 order-2 lg:order-1">
              <div className="glass-card p-6 flex flex-col gap-4 sticky top-24">
                <div className="flex items-center gap-2 font-semibold text-lg text-primary">
                  <PenTool size={20} />
                  <span>Signature</span>
                </div>

                {!signatureData ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-secondary">Draw your signature below:</p>
                    <div className="w-full bg-white rounded-lg border border-border shadow-sm overflow-hidden touch-none">
                      <canvas
                        ref={sigCanvasRef}
                        width={280}
                        height={120}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="cursor-crosshair w-full"
                      />
                    </div>
                    <div className="flex justify-between mt-2">
                      <button onClick={clearSignature} className="text-xs text-secondary hover:text-black flex items-center gap-1">
                        <Undo2 size={14}/> Clear
                      </button>
                      <button onClick={saveSignature} className="text-sm font-medium text-primary hover:text-primary-hover">
                        Use Signature
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm font-medium text-secondary">Current Signature:</p>
                    <div className="bg-white p-2 rounded-lg border border-border shadow-sm flex items-center justify-center relative">
                      <button 
                        onClick={() => setSignatureData(null)}
                        className="absolute top-1 right-1 p-1 bg-black/10 hover:bg-black/20 rounded-full"
                      >
                        <X size={12}/>
                      </button>
                      <img src={signatureData} alt="Signature" className="h-16 object-contain pointer-events-none"/>
                    </div>
                    
                    <div className="bg-amber-500/10 text-amber-700 p-3 rounded-lg text-xs leading-relaxed border border-amber-500/20">
                      <strong>Tip:</strong> Drag the signature box on the document preview to position it exactly where you want it.
                    </div>

                    <div className="h-px w-full bg-border my-2" />

                    <ActionButton 
                      onClick={handleApplySignature}
                      isLoading={isProcessing}
                      disabled={isProcessing}
                    >
                      Sign &amp; Download
                    </ActionButton>
                    
                    <button 
                      onClick={handleCancel}
                      className="text-sm text-secondary hover:text-red-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: PDF Preview & Placer */}
            <div className="flex-1 glass-card p-6 order-1 lg:order-2">
              
              {/* Pagination */}
              <div className="flex justify-between items-center mb-4">
                <span className="font-semibold text-lg truncate w-1/2">{file.name}</span>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded bg-black/5 hover:bg-black/10 disabled:opacity-30"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-sm font-medium">Page {currentPage} of {pageCount}</span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
                    disabled={currentPage === pageCount}
                    className="p-1 rounded bg-black/5 hover:bg-black/10 disabled:opacity-30"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* Viewport */}
              <div 
                className="relative bg-black/5 dark:bg-white/5 border border-border rounded-lg overflow-hidden flex items-center justify-center min-h-[500px]"
                onMouseMove={handleDrag}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
              >
                <canvas ref={setCanvasElement} className="bg-white shadow-xl max-w-full h-auto" />
                
                {/* Signature draggable overlay */}
                {canvasDisplaySize.width > 0 && signatureData && (
                  <div
                    className="absolute z-10"
                    style={{
                      left: canvasElement ? `${canvasElement.offsetLeft}px` : '0',
                      top: canvasElement ? `${canvasElement.offsetTop}px` : '0',
                      width: `${canvasDisplaySize.width}px`,
                      height: `${canvasDisplaySize.height}px`,
                      pointerEvents: 'none'
                    }}
                  >
                    <div
                      className={`absolute border-2 ${isDraggingNode ? 'border-primary border-solid' : 'border-primary border-dashed'} bg-primary/10 cursor-move flex items-center justify-center overflow-hidden select-none pointer-events-auto`}
                      style={getOverlayStyle()}
                      onMouseDown={handleDragStart}
                    >
                      <img src={signatureData} alt="" className="w-full h-full object-contain pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
