"use client";

import { useState } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { compressPDF, compressPDFExtreme } from "@/lib/pdf-utils";
import { downloadFile } from "@/lib/download";
import { motion, AnimatePresence } from "framer-motion";
import { Minimize, FileDown, CheckCircle2 } from "lucide-react";

export default function CompressPDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [compressionLevel, setCompressionLevel] = useState(50);
  const [result, setResult] = useState<{ originalSize: number; newSize: number; blob: Uint8Array } | null>(null);

  const handleFileSelected = (files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setResult(null);
    }
  };

  const handleCompress = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(10);
    
    try {
      let compressedBytes: Uint8Array;
      let interval: NodeJS.Timeout | undefined;
      
      if (compressionLevel === 0) {
        // Basic lossless garbage collection
        interval = setInterval(() => setProgress(p => Math.min(p + 15, 90)), 300);
        compressedBytes = await compressPDF(file);
      } else {
        // Extreme lossy compression
        // Map 1-100 to quality 0.9 down to 0.1
        const quality = 1.0 - (compressionLevel / 100) * 0.9;
        compressedBytes = await compressPDFExtreme(file, quality, (p) => setProgress(p));
      }
      
      if (interval) clearInterval(interval);
      setProgress(100);

      let finalBytes = compressedBytes;
      let finalNewSize = compressedBytes.byteLength;

      // If rasterizing actually increased the file size (common with vector-heavy architectural drawings)
      if (finalNewSize >= file.size && compressionLevel > 0) {
        // Fallback to lossless compression
        const basicBytes = await compressPDF(file);
        if (basicBytes.byteLength < finalNewSize) {
          finalBytes = basicBytes;
          finalNewSize = basicBytes.byteLength;
        }
      }

      // If it's STILL larger than the original, just return the original file to prevent bloating
      if (finalNewSize >= file.size) {
        finalBytes = new Uint8Array(await file.arrayBuffer());
        finalNewSize = file.size;
      }
      
      setResult({
        originalSize: file.size,
        newSize: finalNewSize,
        blob: finalBytes
      });
      
    } catch (err) {
      console.error(err);
      alert("Failed to compress PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="mb-8 pl-2 border-l-4 border-primary/50">
        <h2 className="text-2xl font-bold">Compress PDF</h2>
        <p className="text-secondary opacity-80 mt-1">
          Reduce the file size of your PDF document for easier sharing.
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
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-8 flex flex-col items-center max-w-xl mx-auto"
          >
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
              <Minimize size={32} />
            </div>
            
            <h3 className="text-xl font-bold mb-1 text-center truncate w-full px-4">{file.name}</h3>
            <p className="text-secondary mb-8">Original size: {formatSize(file.size)}</p>

            {result ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex flex-col items-center"
              >
                {result.newSize >= result.originalSize ? (
                  <div className="bg-amber-500/10 text-amber-700 border border-amber-500/20 rounded-xl p-4 w-full mb-6 flex flex-col items-center text-center">
                    <CheckCircle2 className="mb-2" size={28} />
                    <p className="font-semibold text-lg">Highly Optimized File</p>
                    <p className="text-sm mt-2 opacity-90 max-w-sm">
                      This PDF contains highly optimized vector data. Further compression via our extreme method would actually increase its size. We have safely preserved your original file.
                    </p>
                    <div className="text-xl font-bold mt-4">{formatSize(result.originalSize)}</div>
                  </div>
                ) : (
                  <div className="bg-green-500/10 text-green-600 border border-green-500/20 rounded-xl p-4 w-full mb-6 flex flex-col items-center text-center">
                    <CheckCircle2 className="mb-2" size={28} />
                    <p className="font-semibold text-lg">Compression Complete!</p>
                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <div className="line-through opacity-70">{formatSize(result.originalSize)}</div>
                      <div className="text-xl font-bold">{formatSize(result.newSize)}</div>
                    </div>
                    <p className="text-xs mt-2 opacity-80">
                      Saved {Math.round((1 - result.newSize / result.originalSize) * 100)}%
                    </p>
                  </div>
                )}

                <div className="flex gap-4 w-full justify-center mt-2">
                  <button 
                    onClick={() => { setFile(null); setResult(null); }}
                    className="px-6 py-2 rounded-xl border border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium text-sm"
                  >
                    Compress Another
                  </button>
                  <ActionButton 
                    onClick={() => downloadFile(result.blob, `Compressed_${file.name}`)}
                  >
                    <FileDown size={18} />
                    Download PDF
                  </ActionButton>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center w-full">
                <div className="glass w-full rounded-xl p-5 mb-8 text-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-foreground">Compression Level</span>
                    <span className="text-primary font-bold">{compressionLevel}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={compressionLevel}
                    onChange={(e) => setCompressionLevel(parseInt(e.target.value))}
                    className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-secondary mt-1">
                    <span>Lossless (Garbage Collection)</span>
                    <span>Extreme (Rasterized)</span>
                  </div>
                  <div className="bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 rounded-lg text-xs leading-relaxed border border-amber-500/20 mt-2">
                    {compressionLevel === 0 
                      ? "Basic compression simply drops unused objects. Keeps text selectable and quality untouched."
                      : "Extreme compression flattens the PDF into images. Text will not be selectable, but file size will be drastically reduced."}
                  </div>
                </div>

                {isProcessing && <ProgressBar progress={progress} className="mb-6 w-full" />}
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setFile(null)}
                    disabled={isProcessing}
                    className="px-6 py-2 rounded-xl text-secondary hover:text-black dark:hover:text-white transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <ActionButton 
                    onClick={handleCompress}
                    isLoading={isProcessing}
                    disabled={isProcessing}
                    className="min-w-[160px]"
                  >
                    Compress File
                  </ActionButton>
                </div>
              </div>
            )}
            
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
