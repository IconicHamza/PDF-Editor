"use client";

import { useEffect, useState, useRef } from "react";
import { loadPDF, renderPageToCanvas } from "@/lib/pdf-renderer";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface PageThumbnailProps {
  file: File;
  pageNumber: number;
  isSelected?: boolean;
  onSelect?: () => void;
  scale?: number;
}

export function PageThumbnail({ 
  file, 
  pageNumber, 
  isSelected = false, 
  onSelect,
  scale = 0.5 
}: PageThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const doc = await loadPDF(file);
        if (active && canvasRef.current) {
          await renderPageToCanvas(doc, pageNumber, canvasRef.current, scale);
        }
        await doc.destroy();
      } catch (err) {
        console.error("Failed to render thumbnail", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [file, pageNumber, scale]);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`
        relative cursor-pointer rounded-xl overflow-hidden glass transition-all
        flex flex-col items-center justify-center min-h-[150px]
        ${isSelected ? "ring-2 ring-primary bg-primary/10" : "hover:ring-1 hover:ring-primary/50"}
      `}
    >
      {loading ? (
        <Loader2 className="animate-spin text-primary/50 mb-2" />
      ) : (
        <canvas ref={canvasRef} className="max-w-full h-auto drop-shadow-md bg-white" />
      )}
      
      <div className={`
        absolute bottom-0 left-0 right-0 py-1 text-center text-xs font-medium 
        backdrop-blur-md bg-black/20 text-white
        ${isSelected ? "bg-primary/80" : ""}
      `}>
        Page {pageNumber}
      </div>
    </motion.div>
  );
}
