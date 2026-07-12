"use client";

import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getPageThumbnailDataUrl } from "@/lib/pdf-renderer";
import { RotateCw, Trash2, GripHorizontal, Loader2 } from "lucide-react";

interface SortableThumbnailProps {
  id: string;
  file: File;
  originalPageNumber: number;
  displayNumber: number;
  rotation: number;
  onRotate: (id: string) => void;
  onRemove: (id: string) => void;
}

export function SortableThumbnail({ 
  id, file, originalPageNumber, displayNumber, rotation, onRotate, onRemove 
}: SortableThumbnailProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const dataUrl = await getPageThumbnailDataUrl(file, originalPageNumber, 0.4);
        if (active) setThumbnailUrl(dataUrl);
      } catch (err) {
        console.error("Failed to render organize thumbnail", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [file, originalPageNumber]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`relative group ${isDragging ? "opacity-50 scale-105" : ""}`}
    >
      <div 
        className="w-full relative transition-transform duration-300 transform-gpu rounded-xl overflow-hidden glass min-h-[120px] flex items-center justify-center"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <div className={isDragging ? "ring-2 ring-primary bg-primary/10 rounded-xl" : ""}>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="animate-spin text-primary/50" />
            </div>
          ) : thumbnailUrl ? (
            <img 
              src={thumbnailUrl} 
              alt={`Page ${displayNumber}`}
              className="w-full h-auto bg-white drop-shadow-md"
              draggable={false}
            />
          ) : (
            <div className="flex items-center justify-center p-8 text-secondary text-xs">
              Page {displayNumber}
            </div>
          )}
        </div>
      </div>

      {/* Overlays that don't rotate */}
      <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-xl flex flex-col items-center justify-between p-2">
        
        {/* Top actions */}
        <div className="flex w-full justify-between">
          <div 
            {...attributes} 
            {...listeners}
            className="p-1.5 cursor-grab active:cursor-grabbing bg-white text-black rounded-lg hover:bg-gray-200"
          >
            <GripHorizontal size={16} />
          </div>

          <button 
            onClick={() => onRemove(id)}
            className="p-1.5 cursor-pointer bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Center label */}
        <div className="bg-black/60 text-white font-bold py-1 px-3 rounded-full text-xs">
          Page {displayNumber}
        </div>

        {/* Bottom actions */}
        <div className="flex w-full justify-center">
          <button 
            onClick={() => onRotate(id)}
            className="p-1.5 cursor-pointer bg-primary text-white rounded-lg hover:bg-primary-hover flex items-center gap-1 text-xs"
          >
            <RotateCw size={14} /> 90°
          </button>
        </div>
      </div>
    </div>
  );
}
