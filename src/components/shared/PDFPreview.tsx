"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { loadPDF, renderPageToCanvas } from "@/lib/pdf-renderer";
import { Loader2, Maximize2, Minimize2, Eye, PenLine } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { sampleColorsFromCanvas, TextEditData } from "@/lib/textEdit";

interface PDFPreviewProps {
  file: File;
  page?: number;
  scale?: number;
  mode?: "view" | "edit-text";
  edits?: Record<string, TextEditData>;
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
  // This wrapper is the positioning context for all overlays.
  // It matches the canvas's CSS display size exactly.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PDF page size in points (unscaled)
  const [pdfDims, setPdfDims] = useState({ w: 0, h: 0 });
  // Canvas CSS display size in layout pixels (updated by ResizeObserver)
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  // Text items + styles from pdfjs
  const [textItems, setTextItems] = useState<any[]>([]);
  const [styles, setStyles] = useState<Record<string, any>>({});

  // Edit vs Preview sub-mode (only relevant when mode === "edit-text")
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  // Active inline edit
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── ResizeObserver: keeps displaySize in sync with actual canvas layout ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      setDisplaySize({ w: r.width, h: r.height });
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Also recalculate on fullscreen change ──
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Force displaySize recalc after layout settles
      requestAnimationFrame(() => {
        if (canvasRef.current) {
          const r = canvasRef.current.getBoundingClientRect();
          setDisplaySize({ w: r.width, h: r.height });
        }
      });
    };
    document.addEventListener("fullscreenchange", handler);
    window.addEventListener("resize", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      window.removeEventListener("resize", handler);
    };
  }, []);

  // ── Render PDF page ──────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    let doc: PDFDocumentProxy | null = null;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setEditingIdx(null);
        setViewMode("edit");

        doc = await loadPDF(file);
        const pageObj = await doc.getPage(page);
        const vp = pageObj.getViewport({ scale: 1.0 });

        if (active) setPdfDims({ w: vp.width, h: vp.height });

        if (active && canvasRef.current) {
          await renderPageToCanvas(doc, page, canvasRef.current, scale);

          // Measure display size after CSS settles
          requestAnimationFrame(() => {
            if (canvasRef.current) {
              const r = canvasRef.current.getBoundingClientRect();
              setDisplaySize({ w: r.width, h: r.height });
            }
          });

          // Extract text content for edit overlay
          if (active && mode === "edit-text") {
            const tc = await pageObj.getTextContent();
            if (active) {
              setTextItems(tc.items);
              setStyles(tc.styles);
              onStylesLoaded?.(tc.styles);
            }
          }
        }
      } catch (err) {
        console.error("PDFPreview render failed:", err);
        if (active) setError("Could not render page.");
      } finally {
        if (active) setLoading(false);
        if (doc) await doc.destroy();
      }
    })();

    return () => { active = false; };
  }, [file, page, scale, mode]);

  // ── Fullscreen toggle ─────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    if (!isFullscreen) {
      el.requestFullscreen?.().catch(() => setIsFullscreen(true));
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => setIsFullscreen(false));
      else setIsFullscreen(false);
    }
  }, [isFullscreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen && !document.fullscreenElement) setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // ── Inline editing ────────────────────────────────────────────────────────
  const commitEdit = useCallback((idx: number) => {
    if (!onCommitEdit || !canvasRef.current || pdfDims.w === 0) return;
    const item = textItems[idx];
    if (!item) return;

    const x = item.transform[4];
    const y = item.transform[5];
    const fh = Math.abs(item.transform[3]);
    const w = item.width;
    const h = item.height || fh;

    // Sample colors from the clean source canvas
    const sampled = sampleColorsFromCanvas(canvasRef.current, pdfDims.w, pdfDims.h, { x, y, width: w, height: h });
    onCommitEdit(idx, item, editValue, sampled.color, sampled.bgColor);
    setEditingIdx(null);
  }, [editValue, textItems, onCommitEdit, pdfDims]);

  const startEditing = useCallback((idx: number, text: string) => {
    setViewMode("edit");
    setEditingIdx(idx);
    setEditValue(text);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(idx); }
    else if (e.key === "Escape") setEditingIdx(null);
  }, [commitEdit]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const pageIdx = page - 1;
  const isEditing = mode === "edit-text";

  // Collect edits for this page
  const pageEdits: Record<number, TextEditData> = {};
  Object.keys(edits).forEach((key) => {
    const [pi, ii] = key.split("-").map(Number);
    if (pi === pageIdx) pageEdits[ii] = edits[key];
  });

  // Convert PDF coords → CSS % (PDF origin bottom-left, CSS origin top-left)
  const pdfToOverlay = (item: any) => {
    const x = item.transform[4];
    const y = item.transform[5];
    const fh = Math.abs(item.transform[3]);
    const w = item.width;
    const h = item.height || fh;

    return {
      left: `${(x / pdfDims.w) * 100}%`,
      top: `${((pdfDims.h - y - h) / pdfDims.h) * 100}%`,
      width: `${(w / pdfDims.w) * 100}%`,
      height: `${(h / pdfDims.h) * 100}%`,
      fontSize: displaySize.h > 0 ? (fh / pdfDims.h) * displaySize.h : 0,
    };
  };

  const getFontCSS = (item: any) => {
    const s = styles[item.fontName] || {};
    const ff = s.fontFamily || "sans-serif";
    const n = (item.fontName || "").toLowerCase();
    return {
      fontFamily: ff,
      fontStyle: (ff.toLowerCase().includes("italic") || ff.toLowerCase().includes("oblique") || n.includes("italic")) ? "italic" as const : "normal" as const,
      fontWeight: (ff.toLowerCase().includes("bold") || n.includes("bold")) ? "bold" as const : "normal" as const,
    };
  };

  return (
    <div
      ref={outerRef}
      className={`relative flex flex-col bg-black/5 dark:bg-white/5 rounded-2xl border border-border overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-[9999] rounded-none bg-background" : ""
      }`}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      {isEditing && !loading && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface/80 backdrop-blur-sm flex-shrink-0 flex-wrap">
          <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs font-medium">
            <button
              onClick={() => { setEditingIdx(null); setViewMode("edit"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                viewMode === "edit" ? "bg-primary text-white" : "hover:bg-black/5 dark:hover:bg-white/5 text-foreground/70"
              }`}
            >
              <PenLine size={13} /> Edit
            </button>
            <button
              onClick={() => { setEditingIdx(null); setViewMode("preview"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                viewMode === "preview" ? "bg-primary text-white" : "hover:bg-black/5 dark:hover:bg-white/5 text-foreground/70"
              }`}
            >
              <Eye size={13} /> Preview
            </button>
          </div>

          <span className="text-xs text-foreground/50 ml-1">
            {viewMode === "edit"
              ? "Click any text to edit · Enter to confirm"
              : "Preview — shows how the exported PDF will look"}
          </span>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Maximize editor"}
            className="ml-auto p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-foreground/60 hover:text-foreground transition-colors"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      )}

      {/* ── Canvas + overlay area ────────────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center min-h-[400px] overflow-auto p-4">
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center text-primary/60 z-30 bg-background/60 backdrop-blur-sm"
            >
              <Loader2 className="animate-spin mb-3" size={36} />
              <span className="text-sm font-medium">Rendering page…</span>
            </motion.div>
          )}
        </AnimatePresence>

        {error ? (
          <div className="text-red-500 font-medium px-6 text-center">{error}</div>
        ) : (
          /* Wrapper: this div IS the positioning context for overlay elements.
             Its size is driven by the canvas's CSS display size. */
          <div
            ref={wrapperRef}
            className="relative inline-block"
            style={{ width: displaySize.w || undefined, height: displaySize.h || undefined }}
          >
            {/* The pdfjs canvas — always sharp, always the source of truth */}
            <canvas ref={canvasRef} className="bg-white drop-shadow-xl block max-w-full" />

            {/* ── Text overlay layer ──────────────────────────────────── */}
            {isEditing && !loading && pdfDims.w > 0 && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {textItems.map((item, idx) => {
                  if (!item.str || !item.str.trim()) return null;

                  const existingEdit = pageEdits[idx];
                  const displayStr = existingEdit ? existingEdit.newText : item.str;
                  const pos = pdfToOverlay(item);
                  const fontCSS = getFontCSS(item);

                  // ── Active input ──
                  if (editingIdx === idx) {
                    return (
                      <div
                        key={`${pageIdx}-${idx}`}
                        className="absolute pointer-events-auto z-20"
                        style={{ left: pos.left, top: pos.top, width: pos.width, height: pos.height }}
                      >
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(idx)}
                          onKeyDown={(e) => onKeyDown(e, idx)}
                          className="w-full h-full bg-white/95 dark:bg-slate-900/95 border-2 border-primary text-black dark:text-white rounded-sm px-0.5 focus:outline-none leading-none backdrop-blur-sm shadow-lg"
                          style={{
                            fontSize: pos.fontSize > 0 ? `${pos.fontSize}px` : undefined,
                            ...fontCSS,
                          }}
                        />
                      </div>
                    );
                  }

                  // ── Committed edit: CSS-based live preview ──
                  // In Edit mode: shows replacement text with sampled bg + dashed border
                  // In Preview mode: shows replacement text with sampled bg, NO border
                  if (existingEdit) {
                    const [bgR, bgG, bgB] = existingEdit.bgColor;
                    const [tR, tG, tB] = existingEdit.color;

                    return (
                      <div
                        key={`${pageIdx}-${idx}`}
                        onClick={viewMode === "edit" ? () => startEditing(idx, displayStr) : undefined}
                        title={viewMode === "edit" ? `Edited · original: "${item.str}"` : undefined}
                        className={`absolute overflow-hidden whitespace-nowrap leading-none flex items-center ${
                          viewMode === "edit"
                            ? "pointer-events-auto cursor-text border border-dashed border-emerald-500/70"
                            : "pointer-events-none border-none"
                        }`}
                        style={{
                          left: pos.left,
                          top: pos.top,
                          width: pos.width,
                          height: pos.height,
                          fontSize: pos.fontSize > 0 ? `${pos.fontSize}px` : undefined,
                          ...fontCSS,
                          backgroundColor: `rgb(${Math.round(bgR * 255)},${Math.round(bgG * 255)},${Math.round(bgB * 255)})`,
                          color: `rgb(${Math.round(tR * 255)},${Math.round(tG * 255)},${Math.round(tB * 255)})`,
                        }}
                      >
                        {displayStr}
                      </div>
                    );
                  }

                  // ── Unedited run: transparent hit target (edit mode only) ──
                  if (viewMode !== "edit") return null;

                  return (
                    <div
                      key={`${pageIdx}-${idx}`}
                      onClick={() => startEditing(idx, displayStr)}
                      title={`Click to edit: "${item.str}"`}
                      className="absolute pointer-events-auto cursor-text select-none border border-transparent hover:border-primary/50 hover:bg-primary/5 transition-all duration-100"
                      style={{ left: pos.left, top: pos.top, width: pos.width, height: pos.height }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Fullscreen close hint ──────────────────────────────────────── */}
      {isFullscreen && (
        <div className="flex-shrink-0 flex items-center justify-center py-2 border-t border-border bg-surface/60 text-xs text-foreground/40">
          Press <kbd className="mx-1 px-1 rounded border border-border font-mono text-[10px]">Esc</kbd> or
          <button onClick={toggleFullscreen} className="ml-1 underline hover:text-foreground/80">click here</button>
          {" "}to exit fullscreen
        </div>
      )}
    </div>
  );
}
