"use client";

import { useState, useEffect } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { PageThumbnail } from "@/components/shared/PageThumbnail";
import { splitPDF } from "@/lib/pdf-utils";
import { getPageCount } from "@/lib/pdf-renderer";
import { downloadFile } from "@/lib/download";
import { motion, AnimatePresence } from "framer-motion";
import { Split } from "lucide-react";

export default function SplitPDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [rangeInput, setRangeInput] = useState("");

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    
    setLoadingFile(true);
    try {
      const count = await getPageCount(selectedFile);
      setFile(selectedFile);
      setPageCount(count);
      setSelectedPages(new Set()); // Reset selections
      setRangeInput("");
    } catch (err) {
      console.error(err);
      alert("Failed to read PDF file.");
    } finally {
      setLoadingFile(false);
    }
  };

  const togglePageSelection = (pageNumber: number) => {
    const newSelection = new Set(selectedPages);
    if (newSelection.has(pageNumber)) {
      newSelection.delete(pageNumber);
    } else {
      newSelection.add(pageNumber);
    }
    setSelectedPages(newSelection);
    // update text input loosely based on selection
    setRangeInput(Array.from(newSelection).sort((a,b)=>a-b).join(", "));
  };

  const handleRangeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRangeInput(val);
    
    // Parse ranges like "1, 3, 5-7"
    const parsed = new Set<number>();
    const parts = val.split(",").map(p => p.trim()).filter(Boolean);
    
    parts.forEach(part => {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(n => parseInt(n));
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            if (i > 0 && i <= pageCount) parsed.add(i);
          }
        }
      } else {
        const num = parseInt(part);
        if (!isNaN(num) && num > 0 && num <= pageCount) parsed.add(num);
      }
    });
    
    setSelectedPages(parsed);
  };

  const selectAll = () => {
    const all = new Set<number>();
    for (let i = 1; i <= pageCount; i++) all.add(i);
    setSelectedPages(all);
    setRangeInput(`1-${pageCount}`);
  };

  const clearSelection = () => {
    setSelectedPages(new Set());
    setRangeInput("");
  };

  const handleSplit = async () => {
    if (!file || selectedPages.size === 0) return;
    
    setIsProcessing(true);
    try {
      // pdf-lib logic works with 0-indexed arrays
      const indices = Array.from(selectedPages)
        .sort((a, b) => a - b)
        .map(p => p - 1);
        
      const newPdfBytes = await splitPDF(file, indices);
      downloadFile(newPdfBytes, `Split_${file.name}`);
      
    } catch (err) {
      console.error(err);
      alert("Failed to split PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-8 pl-2 border-l-4 border-primary/50">
        <h2 className="text-2xl font-bold">Split PDF</h2>
        <p className="text-secondary opacity-80 mt-1">
          Extract selected pages from your PDF file. Click on pages or type a custom range.
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
            {loadingFile && <p className="text-center mt-4 text-primary animate-pulse">Analyzing PDF...</p>}
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col lg:flex-row gap-8"
          >
            {/* Left sidebar: Controls */}
            <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0 order-2 lg:order-1">
              <div className="glass-card p-6 flex flex-col gap-4 sticky top-24">
                <div className="flex items-center gap-2 font-semibold text-lg text-primary overflow-hidden">
                  <Split size={20} className="shrink-0" />
                  <span className="truncate" title={file.name}>{file.name}</span>
                </div>
                
                <div className="text-sm font-medium">
                  Total Pages: <span className="text-primary">{pageCount}</span>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-secondary">Custom Range</label>
                  <input
                    type="text"
                    value={rangeInput}
                    onChange={handleRangeInputChange}
                    placeholder="e.g. 1-5, 8, 11-13"
                    className="w-full bg-black/5 dark:bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex justify-between text-xs mt-1">
                    <button onClick={selectAll} className="text-primary hover:underline font-medium">Select All</button>
                    <button onClick={clearSelection} className="text-secondary hover:text-black dark:hover:text-white transition-colors">Clear</button>
                  </div>
                </div>

                <div className="h-px bg-border my-2 w-full" />

                <div className="text-sm">
                  <span className="font-semibold text-primary">{selectedPages.size}</span> pages selected
                </div>

                <ActionButton 
                  onClick={handleSplit}
                  isLoading={isProcessing}
                  disabled={selectedPages.size === 0 || isProcessing}
                  className="w-full mt-2"
                >
                  Extract Pages
                </ActionButton>

                <button 
                  onClick={() => { setFile(null); setPageCount(0); setSelectedPages(new Set()); clearSelection(); }}
                  className="w-full py-2 text-sm font-medium text-secondary hover:text-red-500 transition-colors mt-2"
                >
                  Choose another file
                </button>
              </div>
            </div>

            {/* Right side: Page Grid */}
            <div className="flex-1 glass-card p-6 min-h-[500px] order-1 lg:order-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {Array.from({ length: pageCount }).map((_, i) => (
                  <PageThumbnail 
                    key={i} 
                    file={file} 
                    pageNumber={i + 1} 
                    isSelected={selectedPages.has(i + 1)}
                    onSelect={() => togglePageSelection(i + 1)}
                    scale={0.4}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
