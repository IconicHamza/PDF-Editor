"use client";

import { useEffect, useState } from "react";
import { getPageThumbnailDataUrl } from "@/lib/pdf-renderer";
import { Loader2, AlertTriangle } from "lucide-react";
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
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setThumbnailUrl(null);

    (async () => {
      try {
        const dataUrl = await getPageThumbnailDataUrl(file, pageNumber, scale);
        if (active) {
          setThumbnailUrl(dataUrl);
        }
      } catch (err) {
        console.error("Failed to render thumbnail for page", pageNumber, err);
        if (active) setError(true);
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
        flex flex-col items-center justify-center min-h-[120px]
        ${isSelected ? "ring-2 ring-primary bg-primary/10" : "hover:ring-1 hover:ring-primary/50"}
      `}
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center p-6">
          <Loader2 className="animate-spin text-primary/50 mb-2" />
          <span className="text-xs text-secondary">Loading...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-4 text-amber-500">
          <AlertTriangle size={24} className="mb-1" />
          <span className="text-xs">Preview unavailable</span>
        </div>
      ) : (
        <img 
          src={thumbnailUrl!} 
          alt={`Page ${pageNumber}`}
          className="w-full h-auto drop-shadow-md bg-white"
          draggable={false}
        />
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
