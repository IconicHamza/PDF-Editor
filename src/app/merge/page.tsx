"use client";

import { useState } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { SortableFileItem } from "@/components/shared/SortableItem";
import { mergePDFs } from "@/lib/pdf-utils";
import { downloadFile } from "@/lib/download";

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
import { motion, AnimatePresence } from "framer-motion";
import { FilePlus } from "lucide-react";

interface FileWithId {
  id: string;
  file: File;
}

export default function MergePDFPage() {
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Setup DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFilesSelected = (newFiles: File[]) => {
    const filesWithIds = newFiles.map(f => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      file: f
    }));
    setFiles(prev => [...prev, ...filesWithIds]);
  };

  const removeFile = (id: string) => {
    setFiles(files.filter((f) => f.id !== id));
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleMerge = async () => {
    if (files.length < 2) return;
    
    setIsProcessing(true);
    setProgress(0);
    
    try {
      const actualFiles = files.map(f => f.file);
      const mergedPdfBytes = await mergePDFs(actualFiles, (p) => setProgress(p));
      
      setProgress(100);
      
      // Delay to show 100% completion before downloading
      setTimeout(() => {
        downloadFile(mergedPdfBytes, "Merged_Document.pdf");
        setIsProcessing(false);
      }, 500);

    } catch (err) {
      console.error(err);
      alert("An error occurred while merging the files.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      
      {/* Introduction text */}
      <div className="mb-8 pl-2 border-l-4 border-primary/50">
        <h2 className="text-2xl font-bold">Merge PDF Files</h2>
        <p className="text-secondary opacity-80 mt-1">
          Combine multiple PDFs into a single document. Drag and drop to reorder the files.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {files.length === 0 ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <FileDropZone 
              onFilesSelected={handleFilesSelected} 
              accept="application/pdf"
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
            {/* DnD Context */}
            <div className="glass-card p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <FilePlus className="text-primary" size={20} />
                  Selected Files ({files.length})
                </h3>
                <button 
                  onClick={() => setFiles([])}
                  className="text-sm text-red-500 hover:text-red-600 hover:underline"
                >
                  Clear All
                </button>
              </div>

              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={files.map(f => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col">
                    {files.map((item, index) => (
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
              
              {/* Add More Files Button underneath the list */}
              <div className="mt-4 flex justify-center border-t border-border pt-4">
                 <div className="relative overflow-hidden inline-block group text-sm font-medium text-primary hover:text-primary-hover cursor-pointer p-2 mx-auto">
                    + Add More Files
                    <input
                      type="file"
                      multiple
                      accept="application/pdf"
                      onChange={(e) => {
                        if (e.target.files) handleFilesSelected(Array.from(e.target.files));
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                 </div>
              </div>

            </div>

            {/* Actions */}
            <div className="flex flex-col items-center">
              {isProcessing && <ProgressBar progress={progress} className="mb-4" />}
              <ActionButton 
                onClick={handleMerge}
                isLoading={isProcessing}
                disabled={files.length < 2 || isProcessing}
                className="w-full sm:w-auto min-w-[200px]"
              >
                Merge Documents
              </ActionButton>
              {files.length < 2 && !isProcessing && (
                <p className="text-sm text-secondary mt-2">
                  Please select at least 2 files to merge.
                </p>
              )}
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
