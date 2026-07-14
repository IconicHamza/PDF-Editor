"use client";

import { useEffect, useState, useRef } from "react";
import { loadPDF, renderPageToCanvas } from "@/lib/pdf-renderer";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { sampleColorsFromCanvas, getStandardFontName } from "@/lib/textEdit";

interface PDFPreviewProps {
  file: File;
  page?: number;
  scale?: number;
  mode?: "view" | "edit-text";
  edits?: Record<string, { originalItem: any; newText: string; color: [number, number, number]; bgColor: [number, number, number] }>;
  onCommitEdit?: (
    itemIndex: number,
    originalItem: any,
    newText: string,
    color: [number, number, number],
    bgColor: [number, number, number]
  ) => void;
  onStylesLoaded?: (styles: Record<string, any>) => void;
}

export function PDFPreview({
  file,
  page = 1,
  scale = 1.0,
  mode = "view",
  edits = {},
  onCommitEdit,
  onStylesLoaded,
}: PDFPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PDF page dimension state
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [canvasDisplaySize, setCanvasDisplaySize] = useState({ width: 0, height: 0 });

  // PDF.js text items
  const [textItems, setTextItems] = useState<any[]>([]);
  const [styles, setStyles] = useState<Record<string, any>>({});

  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setCanvasDisplaySize({ width: rect.width, height: rect.height });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let active = true;
    let doc: PDFDocumentProxy | null = null;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setEditingIndex(null);
        doc = await loadPDF(file);

        const pageObj = await doc.getPage(page);
        const viewport = pageObj.getViewport({ scale: 1.0 });

        if (active) {
          setPdfDimensions({ width: viewport.width, height: viewport.height });
        }

        if (active && canvasRef.current) {
          await renderPageToCanvas(doc, page, canvasRef.current, scale);

          // Retrieve text runs
          const textContent = await pageObj.getTextContent();
          if (active) {
            setTextItems(textContent.items);
            setStyles(textContent.styles);
            if (onStylesLoaded) {
              onStylesLoaded(textContent.styles);
            }

            // Measure initial layout size
            requestAnimationFrame(() => {
              if (canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                setCanvasDisplaySize({ width: rect.width, height: rect.height });
              }
            });
          }
        }
      } catch (err) {
        console.error("Preview failed:", err);
        if (active) setError("Could not load preview.");
      } finally {
        if (active) setLoading(false);
        if (doc) await doc.destroy();
      }
    })();

    return () => {
      active = false;
    };
  }, [file, page, scale]);

  // Save changes and exit edit mode
  const commitEdit = (idx: number) => {
    if (editingIndex === null || !onCommitEdit || !canvasRef.current) return;

    const item = textItems[idx];
    const x = item.transform[4];
    const y = item.transform[5];
    const fontHeight = item.transform[3];
    const itemWidth = item.width;
    const itemHeight = item.height || fontHeight;

    // Sample background and glyph colors directly from the rendered canvas
    const sampled = sampleColorsFromCanvas(
      canvasRef.current,
      pdfDimensions.width,
      pdfDimensions.height,
      { x, y, width: itemWidth, height: itemHeight }
    );

    onCommitEdit(idx, item, editValue, sampled.color, sampled.bgColor);
    setEditingIndex(null);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter") {
      commitEdit(idx);
    } else if (e.key === "Escape") {
      setEditingIndex(null);
    }
  };

  const startEditing = (idx: number, currentText: string) => {
    setEditingIndex(idx);
    setEditValue(currentText);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden shadow-lg glass border border-border flex items-center justify-center min-h-[400px] w-full bg-black/5 dark:bg-white/5"
    >
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center text-primary/60 z-30 bg-background/50 backdrop-blur-sm"
          >
            <Loader2 className="animate-spin mb-4" size={40} />
            <span className="text-sm font-medium tracking-wide">Rendering Page...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {error ? (
        <div className="text-red-500 font-medium px-4 text-center z-10">{error}</div>
      ) : (
        <div
          className="relative mx-auto my-4"
          style={{
            width: canvasDisplaySize.width ? `${canvasDisplaySize.width}px` : "auto",
            height: canvasDisplaySize.height ? `${canvasDisplaySize.height}px` : "auto",
          }}
        >
          <motion.canvas
            ref={canvasRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: loading ? 0 : 1, scale: loading ? 0.95 : 1 }}
            transition={{ duration: 0.4 }}
            className="max-w-full h-auto bg-white drop-shadow-xl object-contain block"
          />

          {/* Interactive Text Editing Layer */}
          {!loading && mode === "edit-text" && pdfDimensions.width > 0 && (
            <div className="absolute inset-0 select-none overflow-hidden pointer-events-none">
              {textItems.map((item, idx) => {
                const editKey = `${page - 1}-${idx}`;
                const edit = edits[editKey];
                const displayStr = edit ? edit.newText : item.str;

                // Do not render empty runs
                if (!displayStr.trim() && editingIndex !== idx) return null;

                // PDF points layout parameters
                const x = item.transform[4];
                const y = item.transform[5];
                const fontHeight = item.transform[3];
                const width = item.width;
                const height = item.height || fontHeight;

                // Percentage conversion relative to page viewport
                const left = (x / pdfDimensions.width) * 100;
                // PDF Y goes bottom-to-top, CSS top goes top-to-bottom
                const top = ((pdfDimensions.height - y - height) / pdfDimensions.height) * 100;
                const widthPercent = (width / pdfDimensions.width) * 100;
                const heightPercent = (height / pdfDimensions.height) * 100;

                // Scaled screen font size
                const screenFontSize = (fontHeight / pdfDimensions.height) * canvasDisplaySize.height;

                // Font mapping to standard CSS font-families
                const styleObj = styles[item.fontName] || {};
                const fontFamily = styleObj.fontFamily || "sans-serif";
                const isItalic = fontFamily.toLowerCase().includes("italic") || item.fontName.toLowerCase().includes("italic");
                const isBold = fontFamily.toLowerCase().includes("bold") || item.fontName.toLowerCase().includes("bold");

                if (editingIndex === idx) {
                  return (
                    <div
                      key={idx}
                      className="absolute pointer-events-auto z-20"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        width: `${widthPercent}%`,
                        height: `${heightPercent}%`,
                      }}
                    >
                      <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(idx)}
                        onKeyDown={(e) => handleInputKeyDown(e, idx)}
                        className="w-full h-full bg-white dark:bg-slate-900 border border-primary text-black dark:text-white rounded px-0.5 focus:outline-none leading-none shadow-md"
                        style={{
                          fontSize: `${screenFontSize}px`,
                          fontFamily: fontFamily,
                          fontStyle: isItalic ? "italic" : "normal",
                          fontWeight: isBold ? "bold" : "normal",
                        }}
                      />
                    </div>
                  );
                }

                // Inline edits display: cover original canvas text with solid background, then redraw text run on top
                const itemStyle: React.CSSProperties = {
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${widthPercent}%`,
                  height: `${heightPercent}%`,
                  fontSize: `${screenFontSize}px`,
                  fontFamily: fontFamily,
                  fontStyle: isItalic ? "italic" : "normal",
                  fontWeight: isBold ? "bold" : "normal",
                };

                if (edit) {
                  // Redact colors styling
                  itemStyle.background = `rgb(${edit.bgColor[0] * 255}, ${edit.bgColor[1] * 255}, ${edit.bgColor[2] * 255})`;
                  itemStyle.color = `rgb(${edit.color[0] * 255}, ${edit.color[1] * 255}, ${edit.color[2] * 255})`;
                }

                return (
                  <div
                    key={idx}
                    onClick={() => startEditing(idx, displayStr)}
                    className={`absolute pointer-events-auto cursor-text select-text whitespace-nowrap overflow-hidden transition-colors border leading-none flex items-center ${
                      edit
                        ? "border-dashed border-primary bg-primary/5"
                        : "border-transparent hover:border-primary/40 hover:bg-primary/5"
                    }`}
                    style={itemStyle}
                    title={edit ? `Edited (Original: ${item.str})` : "Click to edit"}
                  >
                    {displayStr}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
