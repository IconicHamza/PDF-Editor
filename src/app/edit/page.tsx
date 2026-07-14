"use client";

import { useState } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { PDFPreview } from "@/components/shared/PDFPreview";
import { getPdfInfo } from "@/lib/pdf-renderer";
import { applyTextEditsToPDF, TextEditData } from "@/lib/textEdit";
import { downloadFile } from "@/lib/download";
import { motion, AnimatePresence } from "framer-motion";
import { Type, FileDown, ChevronLeft, ChevronRight, RotateCcw, Trash2 } from "lucide-react";

export default function EditTextPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  // PDF Preview and layout state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  // In-memory edits mapping keyed by `${pageIndex}-${itemIndex}`
  const [edits, setEdits] = useState<Record<string, TextEditData>>({});
  // Cache of PDF.js text styles for the exporter
  const [styles, setStyles] = useState<Record<string, any>>({});

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setLoadingFile(true);

    try {
      const info = await getPdfInfo(selectedFile);
      setFile(selectedFile);
      setPageCount(info.pageCount);
      setCurrentPage(1);
      setEdits({});
      setStyles({});
    } catch (err) {
      console.error("Error analyzing PDF:", err);
      alert("Failed to analyze PDF file. The file may be corrupted.");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleCommitEdit = (
    itemIndex: number,
    originalItem: any,
    newText: string,
    color: [number, number, number],
    bgColor: [number, number, number]
  ) => {
    const editKey = `${currentPage - 1}-${itemIndex}`;
    setEdits((prev) => ({
      ...prev,
      [editKey]: {
        originalItem,
        newText,
        color,
        bgColor,
      },
    }));
  };

  const handleStylesLoaded = (newStyles: Record<string, any>) => {
    setStyles((prev) => ({
      ...prev,
      ...newStyles,
    }));
  };

  const resetPageEdits = () => {
    setEdits((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((key) => {
        if (key.startsWith(`${currentPage - 1}-`)) {
          delete updated[key];
        }
      });
      return updated;
    });
  };

  const discardAllEdits = () => {
    if (confirm("Are you sure you want to discard all text edits?")) {
      setEdits({});
    }
  };

  const handleSave = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const modifiedBytes = await applyTextEditsToPDF(file, edits, styles);
      downloadFile(modifiedBytes, `Edited_${file.name}`);
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to apply text edits and save PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setEdits({});
    setStyles({});
  };

  // Helper to count edits on current page
  const pageEditsCount = Object.keys(edits).filter((key) =>
    key.startsWith(`${currentPage - 1}-`)
  ).length;

  // Helper to count total edits
  const totalEditsCount = Object.keys(edits).length;

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-8 pl-2 border-l-4 border-primary/50">
        <h2 className="text-2xl font-bold">Edit PDF Text</h2>
        <p className="text-secondary opacity-80 mt-1">
          Click any text on the page to edit it inline. Changes will be compiled into the output PDF.
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
            {loadingFile && (
              <p className="text-center mt-4 text-primary animate-pulse">Analyzing Document...</p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col lg:flex-row gap-8"
          >
            {/* Left Sidebar: Controls & Navigation */}
            <div className="w-full lg:w-80 flex flex-col gap-6 order-2 lg:order-1">
              <div className="glass-card p-6 flex flex-col gap-6 sticky top-24">
                <div className="flex items-center gap-2 font-semibold text-lg text-primary">
                  <Type size={20} />
                  <span>Document Editor</span>
                </div>

                <div className="space-y-4">
                  <div className="text-sm font-medium leading-none">
                    File Name:
                    <p className="text-xs text-secondary mt-1 truncate" title={file.name}>
                      {file.name}
                    </p>
                  </div>

                  <div className="h-px bg-border w-full" />

                  {/* Edits Counter */}
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-secondary">Current Page Edits:</span>
                      <span className="font-semibold text-primary">{pageEditsCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Total Edits:</span>
                      <span className="font-semibold text-primary">{totalEditsCount}</span>
                    </div>
                  </div>

                  {totalEditsCount > 0 && (
                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        onClick={resetPageEdits}
                        disabled={pageEditsCount === 0}
                        className="w-full py-2 text-xs font-semibold rounded-lg border border-border flex items-center justify-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        <RotateCcw size={12} /> Reset Current Page
                      </button>
                      <button
                        onClick={discardAllEdits}
                        className="w-full py-2 text-xs font-semibold rounded-lg border border-red-500/20 text-red-500 flex items-center justify-center gap-1.5 hover:bg-red-500/5"
                      >
                        <Trash2 size={12} /> Discard All Changes
                      </button>
                    </div>
                  )}
                </div>

                <div className="h-px bg-border w-full" />

                <div className="flex flex-col gap-3">
                  <ActionButton
                    onClick={handleSave}
                    isLoading={isProcessing}
                    disabled={isProcessing}
                    className="w-full shadow-lg"
                  >
                    <FileDown size={18} /> Save &amp; Download PDF
                  </ActionButton>
                  <button
                    onClick={handleCancel}
                    disabled={isProcessing}
                    className="text-sm font-medium text-secondary hover:text-red-500 py-2 transition-colors"
                  >
                    Close Document
                  </button>
                </div>
              </div>
            </div>

            {/* Right: PDF Viewer with Text Layer */}
            <div className="flex-1 order-1 lg:order-2">
              <div className="glass-card p-6 h-full min-h-[500px] flex flex-col">
                {/* Pagination Controls */}
                <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
                  <div className="font-semibold text-lg truncate w-1/2" title={file.name}>
                    {file.name}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded bg-black/5 hover:bg-black/10 disabled:opacity-30 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <span className="text-sm font-medium">
                      Page {currentPage} of {pageCount}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                      disabled={currentPage === pageCount}
                      className="p-1 rounded bg-black/5 hover:bg-black/10 disabled:opacity-30 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>

                {/* PDF rendering with edit text overlay */}
                <PDFPreview
                  file={file}
                  page={currentPage}
                  mode="edit-text"
                  edits={edits}
                  onCommitEdit={handleCommitEdit}
                  onStylesLoaded={handleStylesLoaded}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
