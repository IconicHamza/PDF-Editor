"use client";

import { useEffect, useState, useRef } from "react";
import { loadPDF, renderPageToCanvas } from "@/lib/pdf-renderer";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PDFPreviewProps {
  file: File;
  page?: number;
  scale?: number;
}

export function PDFPreview({ file, page = 1, scale = 1.0 }: PDFPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let doc: PDFDocumentProxy | null = null;
    
    (async () => {
      try {
        setLoading(true);
        setError(null);
        doc = await loadPDF(file);
        
        if (active && canvasRef.current) {
          await renderPageToCanvas(doc, page, canvasRef.current, scale);
        }
      } catch (err) {
        console.error("Preview failed:", err);
        if (active) setError("Could not load preview.");
      } finally {
        if (active) setLoading(false);
        if (doc) await doc.destroy();
      }
    })();
    return () => { active = false; };
  }, [file, page, scale]);

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-lg glass border border-border flex items-center justify-center min-h-[400px] w-full bg-black/5 dark:bg-white/5">
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center text-primary/60"
          >
            <Loader2 className="animate-spin mb-4" size={40} />
            <span className="text-sm font-medium tracking-wide">Rendering Page...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {error ? (
        <div className="text-red-500 font-medium px-4 text-center">
          {error}
        </div>
      ) : (
        <motion.canvas 
          ref={canvasRef} 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: loading ? 0 : 1, scale: loading ? 0.95 : 1 }}
          transition={{ duration: 0.4 }}
          className="max-w-full h-auto bg-white drop-shadow-xl my-4 object-contain"
        />
      )}
    </div>
  );
}
