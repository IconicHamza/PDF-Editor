"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { addWatermark } from "@/lib/pdf-utils";
import { downloadFile } from "@/lib/download";
import { getPdfInfo, loadPDF, renderPageToCanvas } from "@/lib/pdf-renderer";
import { motion, AnimatePresence } from "framer-motion";
import { Droplet, Type, SlidersHorizontal, Move, ChevronLeft, ChevronRight } from "lucide-react";

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // PDF state
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [canvasDisplaySize, setCanvasDisplaySize] = useState({ width: 0, height: 0 });

  // Watermark options
  const [text, setText] = useState("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(45);
  const [color, setColor] = useState<"red" | "black" | "blue" | "gray">("gray");

  // Draggable position stored as percentage of page dimensions (0-1 range)
  // This makes it resolution/scale independent
  const [posPercent, setPosPercent] = useState({ x: 0.5, y: 0.5 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });

  const colors = {
    red: [0.8, 0, 0] as [number, number, number],
    black: [0, 0, 0] as [number, number, number],
    blue: [0, 0, 0.8] as [number, number, number],
    gray: [0.5, 0.5, 0.5] as [number, number, number],
  };

  const colorHex: Record<string, string> = {
    red: "#ef4444",
    black: "#000000",
    blue: "#3b82f6",
    gray: "#888888",
  };

  // Note: We deliberately do not destroy the pdfDoc on unmount 
  // because React 18 StrictMode immediately unmounts and remounts components, 
  // which would kill the PDFProxy instance in state. 
  // We destroy explicitly when the user loads a new file or clicks Discard Changes.

  // Load PDF
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
      setPosPercent({ x: 0.5, y: 0.5 });

      loadPDF(selectedFile)
        .then((doc) => setPdfDoc(doc))
        .catch((error) => console.warn("Preview rendering is unavailable for this PDF:", error));
    } catch (err) {
      console.error("Error loading PDF:", err);
      alert("Error loading PDF");
    }
  };

  // Render current page to canvas
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
          // After render, measure the displayed canvas size
          requestAnimationFrame(() => {
            if (canvasElement) {
              const rect = canvasElement.getBoundingClientRect();
              setCanvasDisplaySize({ width: rect.width, height: rect.height });
            }
          });
        }
      } catch (err) {
        console.error("Watermark preview render error:", err);
      }
    };
    render();
    return () => { 
      active = false; 
    };
  }, [pdfDoc, currentPage, canvasElement]);

  // Update canvas display size on window resize
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

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      startX: posPercent.x,
      startY: posPercent.y,
    };
  }, [posPercent]);

  const handleDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !canvasElement) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = canvasElement.getBoundingClientRect();
    const deltaX = (clientX - dragStartRef.current.mouseX) / rect.width;
    const deltaY = (clientY - dragStartRef.current.mouseY) / rect.height;

    const newX = Math.max(0, Math.min(1, dragStartRef.current.startX + deltaX));
    const newY = Math.max(0, Math.min(1, dragStartRef.current.startY + deltaY));

    setPosPercent({ x: newX, y: newY });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Apply watermark
  const handleApply = async () => {
    if (!file || !text) return;
    setIsProcessing(true);

    try {
      // Convert percent position to PDF coordinates
      // PDF origin is bottom-left, y goes UP
      // posPercent is top-left origin (CSS-like)
      const pdfX = posPercent.x * pdfDimensions.width;
      const pdfY = (1 - posPercent.y) * pdfDimensions.height; // Flip Y axis

      const options = {
        text,
        opacity,
        rotation,
        color: colors[color],
        fontSize,
        x: pdfX,
        y: pdfY,
      };

      const bytes = await addWatermark(file, options);
      downloadFile(bytes, `Watermark_${file.name}`);
    } catch (err) {
      console.error(err);
      alert("Failed to apply watermark.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate watermark overlay position and style  
  const getOverlayStyle = () => {
    if (canvasDisplaySize.width === 0) return { display: "none" as const };
    return {
      left: `${posPercent.x * 100}%`,
      top: `${posPercent.y * 100}%`,
      transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
      fontSize: `${(fontSize / pdfDimensions.height) * canvasDisplaySize.height}px`,
      opacity: opacity,
      color: colorHex[color],
      textShadow: "0px 0px 4px rgba(255,255,255,0.5)",
    };
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-8 pl-2 border-l-4 border-primary/50">
        <h2 className="text-2xl font-bold">Add Watermark</h2>
        <p className="text-secondary opacity-80 mt-1">
          Stamp your PDF with a customized text watermark. Drag it to position it exactly where you want.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FileDropZone onFilesSelected={handleFileSelected} multiple={false} />
          </motion.div>
        ) : (
          <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col lg:flex-row gap-8">

            {/* Left Controls */}
            <div className="w-full lg:w-80 flex flex-col gap-6 order-2 lg:order-1">
              <div className="glass-card p-6 flex flex-col gap-6 sticky top-24">
                <div className="flex items-center gap-2 font-semibold text-lg text-primary">
                  <SlidersHorizontal size={20} />
                  <span>Configuration</span>
                </div>

                <div className="space-y-4">
                  {/* Text */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Type size={14} /> Text
                    </label>
                    <input
                      type="text"
                      value={text}
                      onChange={e => setText(e.target.value)}
                      className="w-full bg-black/5 dark:bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  {/* Font Size */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium flex justify-between">
                      Size <span>{fontSize}px</span>
                    </label>
                    <input
                      type="range" min={16} max={120}
                      value={fontSize}
                      onChange={e => setFontSize(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Opacity */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium flex justify-between">
                      Opacity <span>{Math.round(opacity * 100)}%</span>
                    </label>
                    <input
                      type="range" min={0.05} max={1} step={0.05}
                      value={opacity}
                      onChange={e => setOpacity(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Rotation */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium flex justify-between">
                      Rotation <span>{rotation} deg</span>
                    </label>
                    <input
                      type="range" min={-90} max={90} step={5}
                      value={rotation}
                      onChange={e => setRotation(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Color */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Color</label>
                    <div className="flex gap-3">
                      {(["gray", "black", "red", "blue"] as const).map(c => (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'}`}
                          style={{ backgroundColor: c === 'gray' ? '#888' : c }}
                          aria-label={`Select ${c}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border my-2 w-full" />

                {/* Drag hint */}
                <div className="bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 rounded-lg text-xs leading-relaxed border border-amber-500/20 flex items-start gap-2">
                  <Move size={16} className="shrink-0 mt-0.5" />
                  <span><strong>Tip:</strong> Drag the watermark text on the preview to position it exactly where you want it on the page.</span>
                </div>

                <div className="flex flex-col gap-3">
                  <ActionButton
                    onClick={handleApply}
                    isLoading={isProcessing}
                    disabled={isProcessing || !text}
                    className="w-full shadow-lg"
                  >
                    <Droplet size={18} /> Apply To Document
                  </ActionButton>
                  <button
                    onClick={() => { if (pdfDoc) pdfDoc.destroy().catch(() => {}); setFile(null); setPdfDoc(null); }}
                    disabled={isProcessing}
                    className="text-sm font-medium text-secondary hover:text-red-500 py-2"
                  >
                    Discard Changes
                  </button>
                </div>
              </div>
            </div>

            {/* Right Preview */}
            <div className="flex-1 order-1 lg:order-2">
              <div className="glass-card p-6 h-full min-h-[500px] flex flex-col">

                {/* Pagination */}
                <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
                  <div className="font-semibold text-lg truncate w-1/2">{file.name}</div>
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

                {/* PDF Canvas + Draggable Watermark Overlay */}
                <div
                  ref={containerRef}
                  className="flex-1 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-xl border border-border p-4 relative overflow-hidden select-none touch-none"
                  onMouseMove={handleDragMove}
                  onMouseUp={handleDragEnd}
                  onMouseLeave={handleDragEnd}
                  onTouchMove={handleDragMove}
                  onTouchEnd={handleDragEnd}
                >
                  {/* Actual PDF Canvas */}
                  <canvas
                    ref={setCanvasElement}
                    className="bg-white shadow-xl max-w-full h-auto"
                    style={{ maxHeight: '70vh' }}
                  />

                  {/* Draggable watermark overlay positioned relative to the canvas */}
                  {canvasDisplaySize.width > 0 && (
                    <div
                      className="absolute inset-0 flex items-start justify-start pointer-events-none"
                    >
                      {/* The watermark text overlay covers the canvas area */}
                      <div
                        className="absolute"
                        style={{
                          // Center within the canvas render area
                          left: canvasElement ? `${canvasElement.offsetLeft}px` : '0',
                          top: canvasElement ? `${canvasElement.offsetTop}px` : '0',
                          width: `${canvasDisplaySize.width}px`,
                          height: `${canvasDisplaySize.height}px`,
                        }}
                      >
                        <div
                          className={`absolute font-bold select-none text-center leading-none whitespace-nowrap pointer-events-auto ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                          style={getOverlayStyle()}
                          onMouseDown={handleDragStart}
                          onTouchStart={handleDragStart}
                        >
                          <div className={`px-2 py-1 rounded border-2 border-dashed ${isDragging ? 'border-primary bg-primary/10' : 'border-primary/40 hover:border-primary hover:bg-primary/5'} transition-colors`}>
                            {text || " "}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="absolute bottom-2 text-xs text-secondary opacity-70 text-center">
                    Drag the watermark to reposition. Preview is approximate.
                  </p>
                </div>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
