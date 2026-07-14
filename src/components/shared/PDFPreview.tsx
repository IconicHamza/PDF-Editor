"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { loadPDF, renderPageToCanvas } from "@/lib/pdf-renderer";
import { Loader2, Maximize2, Minimize2, Eye, PenLine } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { sampleColorsFromCanvas, compositeEditsToCanvas, TextEditData } from "@/lib/textEdit";

interface PDFPreviewProps {
  file: File;
  page?: number;
  scale?: number;
  /** "view" = plain viewer, "edit-text" = show text edit overlay */
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
  // The live pdfjs canvas — shows clean PDF render. We do NOT draw on this.
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  // The composite canvas — shown in preview mode, has edits baked in.
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PDF dimensions in PDF points (unscaled)
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  // Actual CSS display size of the canvas (layout pixels)
  const [canvasDisplaySize, setCanvasDisplaySize] = useState({ width: 0, height: 0 });

  // pdfjs text items & styles for the overlay
  const [textItems, setTextItems] = useState<any[]>([]);
  const [styles, setStyles] = useState<Record<string, any>>({});

  // "edit" = show clickable text overlay, "preview" = show composited result
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  // Which text run is being actively typed in
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track whether composite is stale (needs redraw)
  const compositeStaleRef = useRef(true);

  // ─── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      setCanvasDisplaySize({ width: rect.width, height: rect.height });
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ─── Render PDF page ──────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    let doc: PDFDocumentProxy | null = null;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setEditingIndex(null);
        setViewMode("edit");
        compositeStaleRef.current = true;

        doc = await loadPDF(file);
        const pageObj = await doc.getPage(page);
        const viewport = pageObj.getViewport({ scale: 1.0 });

        if (active) setPdfDimensions({ width: viewport.width, height: viewport.height });

        if (active && sourceCanvasRef.current) {
          await renderPageToCanvas(doc, page, sourceCanvasRef.current, scale);

          // Measure display size after render sets CSS size
          requestAnimationFrame(() => {
            if (sourceCanvasRef.current) {
              const rect = sourceCanvasRef.current.getBoundingClientRect();
              setCanvasDisplaySize({ width: rect.width, height: rect.height });
            }
          });

          if (active && mode === "edit-text") {
            const textContent = await pageObj.getTextContent();
            if (active) {
              setTextItems(textContent.items);
              setStyles(textContent.styles);
              if (onStylesLoaded) onStylesLoaded(textContent.styles);
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

  // ─── Build composite canvas when switching to preview mode ───────────────
  const buildComposite = useCallback(async () => {
    const src = sourceCanvasRef.current;
    const dst = compositeCanvasRef.current;
    if (!src || !dst || pdfDimensions.width === 0) return;

    // Copy source canvas → composite canvas (same physical pixel dimensions)
    dst.width = src.width;
    dst.height = src.height;
    dst.style.width = src.style.width;
    dst.style.height = src.style.height;
    dst.style.maxWidth = src.style.maxWidth;
    dst.style.aspectRatio = src.style.aspectRatio;

    const dstCtx = dst.getContext("2d");
    if (!dstCtx) return;
    dstCtx.drawImage(src, 0, 0);

    // Collect edits for the current page
    const pageIndex = page - 1;
    const pageEdits: Record<number, TextEditData> = {};
    Object.keys(edits).forEach((key) => {
      const [pi, ii] = key.split("-").map(Number);
      if (pi === pageIndex) pageEdits[ii] = edits[key];
    });

    if (Object.keys(pageEdits).length > 0) {
      await compositeEditsToCanvas(dst, pdfDimensions.width, pdfDimensions.height, pageEdits, styles);
    }

    compositeStaleRef.current = false;
  }, [edits, page, pdfDimensions, styles]);

  useEffect(() => {
    compositeStaleRef.current = true;
    if (viewMode === "preview" && !loading) buildComposite();
  }, [edits, viewMode, loading, buildComposite]);

  const handleSwitchToPreview = () => {
    setEditingIndex(null);
    setViewMode("preview");
    buildComposite();
  };

  const handleSwitchToEdit = () => {
    setViewMode("edit");
  };

  // ─── Fullscreen ───────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!isFullscreen) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => setIsFullscreen(true));
      else setIsFullscreen(true);
    } else {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => setIsFullscreen(false));
      } else {
        setIsFullscreen(false);
      }
    }
  }, [isFullscreen]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Escape key exits fullscreen (also handled by browser, but belt + suspenders)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // ─── Inline editing ───────────────────────────────────────────────────────
  const commitEdit = useCallback((idx: number) => {
    if (!onCommitEdit || !sourceCanvasRef.current || pdfDimensions.width === 0) return;

    const item = textItems[idx];
    if (!item) return;

    const x = item.transform[4];
    const y = item.transform[5];
    const fontH = Math.abs(item.transform[3]);
    const w = item.width;
    const h = item.height || fontH;

    // Sample from the source (unmodified) canvas
    const sampled = sampleColorsFromCanvas(
      sourceCanvasRef.current,
      pdfDimensions.width,
      pdfDimensions.height,
      { x, y, width: w, height: h }
    );

    onCommitEdit(idx, item, editValue, sampled.color, sampled.bgColor);
    setEditingIndex(null);
    compositeStaleRef.current = true;
  }, [editValue, textItems, onCommitEdit, pdfDimensions]);

  const startEditing = useCallback((idx: number, currentText: string) => {
    setViewMode("edit");
    setEditingIndex(idx);
    setEditValue(currentText);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(idx); }
    else if (e.key === "Escape") { setEditingIndex(null); }
  }, [commitEdit]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const pageIndex = page - 1;

  // Collect edits for current page for overlay rendering
  const pageEditsMap: Record<number, TextEditData> = {};
  Object.keys(edits).forEach((key) => {
    const [pi, ii] = key.split("-").map(Number);
    if (pi === pageIndex) pageEditsMap[ii] = edits[key];
  });
  const hasEdits = Object.keys(pageEditsMap).length > 0;

  const isEditing = mode === "edit-text";

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-black/5 dark:bg-white/5 rounded-2xl border border-border overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-[9999] rounded-none bg-background" : ""
      }`}
    >
      {/* ── Toolbar (edit-text mode only) ─────────────────────────────── */}
      {isEditing && !loading && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface/80 backdrop-blur-sm flex-shrink-0">
          {/* Mode toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs font-medium">
            <button
              onClick={handleSwitchToEdit}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                viewMode === "edit"
                  ? "bg-primary text-white"
                  : "hover:bg-black/5 dark:hover:bg-white/5 text-foreground/70"
              }`}
            >
              <PenLine size={13} /> Edit
            </button>
            <button
              onClick={handleSwitchToPreview}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                viewMode === "preview"
                  ? "bg-primary text-white"
                  : "hover:bg-black/5 dark:hover:bg-white/5 text-foreground/70"
              }`}
            >
              <Eye size={13} /> Preview
            </button>
          </div>

          {viewMode === "edit" && (
            <span className="text-xs text-foreground/50 ml-1">
              Click any text to edit · Enter or click away to confirm
            </span>
          )}
          {viewMode === "preview" && (
            <span className="text-xs text-foreground/50 ml-1">
              Preview mode — dashed edit indicators are hidden
            </span>
          )}

          <div className="ml-auto">
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen (Esc)" : "Maximize editor"}
              className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-foreground/60 hover:text-foreground transition-colors"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Canvas area ───────────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center min-h-[400px] overflow-auto">
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
          <div className="relative my-4 mx-auto" style={{ display: "contents" }}>
            {/* Source canvas — always rendered by pdfjs, always pixel-perfect */}
            <canvas
              ref={sourceCanvasRef}
              className={`bg-white drop-shadow-xl max-w-full block ${
                // Hide source in preview mode so composite shows
                isEditing && viewMode === "preview" ? "invisible absolute" : ""
              }`}
            />

            {/* Composite canvas — shown only in preview mode */}
            {isEditing && viewMode === "preview" && (
              <canvas
                ref={compositeCanvasRef}
                className="bg-white drop-shadow-xl max-w-full block"
              />
            )}

            {/* Text edit overlay — only in edit mode, never composited onto canvas */}
            {isEditing && viewMode === "edit" && !loading && pdfDimensions.width > 0 && (
              <div
                className="absolute top-0 left-0 pointer-events-none overflow-hidden"
                style={{
                  width: canvasDisplaySize.width || "100%",
                  height: canvasDisplaySize.height || "100%",
                }}
              >
                {textItems.map((item, idx) => {
                  // Only render items with text content (skip whitespace-only spans)
                  if (!item.str) return null;

                  const editKey = `${pageIndex}-${idx}`;
                  const existingEdit = pageEditsMap[idx];
                  const displayStr = existingEdit ? existingEdit.newText : item.str;

                  // PDF coords → CSS % positions (relative to display canvas size)
                  const pdfX = item.transform[4];
                  const pdfY = item.transform[5];
                  const fontH = Math.abs(item.transform[3]);
                  const itemW = item.width;
                  const itemH = item.height || fontH;

                  // Percentage relative to PDF point space
                  const leftPct = (pdfX / pdfDimensions.width) * 100;
                  // PDF y is from bottom; CSS top is from top
                  const topPct = ((pdfDimensions.height - pdfY - itemH) / pdfDimensions.height) * 100;
                  const widthPct = (itemW / pdfDimensions.width) * 100;
                  const heightPct = (itemH / pdfDimensions.height) * 100;

                  // CSS font size (scale fontH from PDF pts → display px)
                  const cssFontSize = canvasDisplaySize.height > 0
                    ? (fontH / pdfDimensions.height) * canvasDisplaySize.height
                    : 0;

                  const styleObj = styles[item.fontName] || {};
                  const fontFamily = styleObj.fontFamily || "sans-serif";
                  const isBold = fontFamily.toLowerCase().includes("bold") || item.fontName.toLowerCase().includes("bold");
                  const isItalic =
                    fontFamily.toLowerCase().includes("italic") ||
                    fontFamily.toLowerCase().includes("oblique") ||
                    item.fontName.toLowerCase().includes("italic");

                  // Active input box
                  if (editingIndex === idx) {
                    return (
                      <div
                        key={editKey}
                        className="absolute pointer-events-auto z-20"
                        style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%` }}
                      >
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(idx)}
                          onKeyDown={(e) => handleKeyDown(e, idx)}
                          className="w-full h-full bg-white/90 dark:bg-slate-900/90 border-2 border-primary text-black dark:text-white rounded-sm px-0.5 focus:outline-none leading-none backdrop-blur-sm shadow-lg"
                          style={{
                            fontSize: cssFontSize > 0 ? `${cssFontSize}px` : undefined,
                            fontFamily,
                            fontStyle: isItalic ? "italic" : "normal",
                            fontWeight: isBold ? "bold" : "normal",
                          }}
                        />
                      </div>
                    );
                  }

                  // Hover / edited affordance — TRANSPARENT background, border only.
                  // We do NOT paint any background color here; the canvas shows through.
                  return (
                    <div
                      key={editKey}
                      onClick={() => startEditing(idx, displayStr)}
                      title={existingEdit ? `Edited · original: "${item.str}"` : `Click to edit: "${item.str}"`}
                      className={`absolute pointer-events-auto cursor-text select-none transition-all duration-100 ${
                        existingEdit
                          ? "border border-dashed border-emerald-500/80 bg-emerald-400/10"
                          : "border border-transparent hover:border-primary/50 hover:bg-primary/5"
                      }`}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                      }}
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
