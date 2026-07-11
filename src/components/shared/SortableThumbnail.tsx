"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageThumbnail } from "@/components/shared/PageThumbnail";
import { RotateCw, Trash2, GripHorizontal } from "lucide-react";
import { motion } from "framer-motion";

interface SortableThumbnailProps {
  id: string; // The original page index + something unique like `page-${index}`
  file: File;
  originalPageNumber: number; // The 1-based index to render from the original PDF
  displayNumber: number; // Current visual order
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
        className="w-full relative transition-transform duration-300 transform-gpu"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {/* We use PageThumbnail to render it, disable its interactions though by overriding styles/clicks basically via pointer-events later or just leaving it read-only */}
        <div className={isDragging ? "ring-2 ring-primary bg-primary/10 rounded-xl" : ""}>
          <PageThumbnail 
            file={file} 
            pageNumber={originalPageNumber} 
            scale={0.5} 
          />
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
