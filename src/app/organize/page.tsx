"use client";

import { useState } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { SortableThumbnail } from "@/components/shared/SortableThumbnail";
import { getPageCount } from "@/lib/pdf-renderer";
import { downloadFile } from "@/lib/download";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2, ArrowRightLeft } from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";

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
  rectSortingStrategy,
} from "@dnd-kit/sortable";

interface PageData {
  id: string; // "page-1", "page-2"
  originalNum: number; // 1-based index in file
  rotation: number; // degrees
}

export default function OrganizePDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  // Grid sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    
    setLoadingFile(true);
    try {
      const count = await getPageCount(selectedFile);
      const initialPages = Array.from({ length: count }).map((_, i) => ({
        id: `page-${i + 1}`,
        originalNum: i + 1,
        rotation: 0
      }));
      setPages(initialPages);
      setFile(selectedFile);
    } catch (err) {
      console.error(err);
      alert("Failed to read PDF file.");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleRotate = (id: string) => {
    setPages(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, rotation: (p.rotation + 90) % 360 };
      }
      return p;
    }));
  };

  const handleRemove = (id: string) => {
    setPages(prev => prev.filter(p => p.id !== id));
  };
  
  const resetDocument = () => {
    if(!file) return;
    setFile(null);
    setPages([]);
  }

  const handleSave = async () => {
    if (!file || pages.length === 0) return;
    
    setIsProcessing(true);
    try {
      // Reorganize using pdf-lib
      const arrayBuffer = await file.arrayBuffer();
      const donorPdf = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();
      
      const indicesToCopy = pages.map(p => p.originalNum - 1);
      const copiedPages = await newPdf.copyPages(donorPdf, indicesToCopy);
      
      copiedPages.forEach((page, i) => {
        // Apply rotation relative to original
        const customRotation = pages[i].rotation;
        if (customRotation > 0) {
          const currentRotation = page.getRotation().angle;
          page.setRotation(degrees((currentRotation + customRotation) % 360));
        }
        newPdf.addPage(page);
      });
      
      const bytes = await newPdf.save({ useObjectStreams: true });
      downloadFile(bytes, `Organized_${file.name}`);
      
    } catch (err) {
      console.error(err);
      alert("Failed to process PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-8 pl-2 border-l-4 border-primary/50">
        <h2 className="text-2xl font-bold">Organize PDF Pages</h2>
        <p className="text-secondary opacity-80 mt-1">
          Drag and drop to reorder pages. Rotate or delete unwanted pages.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <FileDropZone 
              onFilesSelected={handleFileSelected} 
              accept="application/pdf"
              multiple={false}
            />
            {loadingFile && <p className="text-center mt-4 text-primary animate-pulse">Loading Document...</p>}
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-6"
          >
            
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Settings2 className="text-primary" />
                <div>
                  <h3 className="font-semibold">{file.name}</h3>
                  <p className="text-xs text-secondary">{pages.length} pages remaining</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button 
                  onClick={resetDocument}
                  disabled={isProcessing}
                  className="text-sm font-medium text-secondary hover:text-black dark:hover:text-white"
                >
                  Cancel
                </button>
                <ActionButton 
                  onClick={handleSave} 
                  isLoading={isProcessing}
                  disabled={pages.length === 0}
                >
                  Save Changes
                </ActionButton>
              </div>
            </div>

            {pages.length === 0 && (
              <div className="glass-card p-12 text-center text-secondary border-red-500/20 bg-red-500/5">
                <p className="font-semibold text-lg text-red-500 mb-2">No pages left!</p>
                <p>You have deleted all pages from the document. Please cancel and try again.</p>
              </div>
            )}

            <div className="glass-card p-6 min-h-[400px]">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={pages.map(p => p.id)} 
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {pages.map((page, index) => (
                      <SortableThumbnail
                        key={page.id}
                        id={page.id}
                        file={file}
                        originalPageNumber={page.originalNum}
                        displayNumber={index + 1}
                        rotation={page.rotation}
                        onRotate={handleRotate}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
