"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

interface SortableItemProps {
  id: string;
  file: File;
  onRemove: (id: string) => void;
  index: number;
}

export function SortableFileItem({ id, file, onRemove, index }: SortableItemProps) {
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
      className={`relative ${isDragging ? "opacity-50" : ""}`}
    >
      <div className={`
        mb-3 flex items-center gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4
        ${isDragging ? "ring-2 ring-primary bg-primary/5" : "hover:border-primary/30"}
      `}>
        
        {/* Drag Handle */}
        <div 
          {...attributes} 
          {...listeners}
          className="cursor-grab p-1 text-secondary opacity-60 hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={20} />
        </div>

        {/* Index Badge */}
        <div className="flex h-6 w-6 items-center justify-center rounded bg-black/5 text-xs font-bold text-secondary dark:bg-white/10">
          {index + 1}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="mt-0.5 text-xs text-secondary opacity-80">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>

        {/* Actions */}
        <button
          onClick={(e) => {
            e.stopPropagation(); // prevent drag
            onRemove(id);
          }}
          className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-500/10"
          aria-label="Remove file"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
