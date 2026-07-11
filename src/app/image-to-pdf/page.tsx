"use client";

import { useState } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { SortableFileItem } from "@/components/shared/SortableItem";
import { imagesToPDF } from "@/lib/pdf-utils";
import { downloadFile } from "@/lib/download";
import { motion, AnimatePresence } from "framer-motion";
import { Image as ImageIcon } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface ImageWithId {
  id: string;
  file: File;
}

export default function ImageToPdfPage() {
  const [images, setImages] = useState<ImageWithId[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFilesSelected = (newFiles: File[]) => {
    const filesWithIds = newFiles.map(f => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      file: f
    }));
    setImages(prev => [...prev, ...filesWithIds]);
  };

  const removeFile = (id: string) => {
    setImages(images.filter((f) => f.id !== id));
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setImages((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const convertToPDF = async () => {
    if (images.length === 0) return;
    
    setIsProcessing(true);
    setProgress(10);
    
    try {
      const actualFiles = images.map(f => f.file);
      // Faking progress for aesthetic
      const interval = setInterval(() => {
        setProgress(p => Math.min(p + 15, 90));
      }, 300);
      
      const pdfBytes = await imagesToPDF(actualFiles);
      
      clearInterval(interval);
      setProgress(100);
      
      setTimeout(() => {
        downloadFile(pdfBytes, "Converted_Images.pdf");
        setIsProcessing(false);
      }, 500);

    } catch (err) {
      console.error(err);
      alert("An error occurred during conversion.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="mb-8 pl-2 border-l-4 border-primary/50">
        <h2 className="text-2xl font-bold">Image to PDF</h2>
        <p className="text-secondary opacity-80 mt-1">
          Convert JPG and PNG images into a single PDF document.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {images.length === 0 ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <FileDropZone 
              onFilesSelected={handleFilesSelected} 
              accept="image/jpeg, image/png, image/webp"
              multiple={true}
            />
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="glass-card p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <ImageIcon className="text-primary" size={20} />
                  Selected Images ({images.length})
                </h3>
              </div>

              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={images.map(f => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col">
                    {images.map((item, index) => (
                      <SortableFileItem 
                        key={item.id}
                        id={item.id}
                        file={item.file}
                        index={index}
                        onRemove={removeFile}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="mt-4 flex justify-center border-t border-border pt-4">
                 <div className="relative overflow-hidden inline-block group text-sm font-medium text-primary hover:text-primary-hover cursor-pointer p-2 mx-auto">
                    + Add More Images
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg, image/png, image/webp"
                      onChange={(e) => {
                        if (e.target.files) handleFilesSelected(Array.from(e.target.files));
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                 </div>
              </div>
            </div>

            <div className="flex flex-col items-center">
              {isProcessing && <ProgressBar progress={progress} className="mb-4" />}
              <ActionButton 
                onClick={convertToPDF}
                isLoading={isProcessing}
                disabled={images.length === 0 || isProcessing}
                className="w-full sm:w-auto min-w-[200px]"
              >
                Create PDF
              </ActionButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
