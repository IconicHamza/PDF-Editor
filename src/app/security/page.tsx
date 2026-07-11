"use client";

import { useState } from "react";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { ActionButton } from "@/components/shared/ActionButton";
import { downloadFile } from "@/lib/download";
import { sanitizePDF } from "@/lib/pdf-utils";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, FileDown, ShieldCheck } from "lucide-react";

export default function SecurityPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const handleFileSelected = (files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setResult(null);
    }
  };

  const handleSanitize = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const bytes = await sanitizePDF(file);
      setResult(bytes);
    } catch (err) {
      console.error(err);
      alert("This PDF could not be sanitized. It may be encrypted or damaged.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-6 border-l-4 border-primary pl-4">
        <h2 className="text-2xl font-bold">Secure PDF</h2>
        <p className="mt-1 text-sm leading-6 text-foreground/65">
          Remove common metadata before sharing. This browser build focuses on privacy cleanup rather than password encryption.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <FileDropZone onFilesSelected={handleFileSelected} accept="application/pdf" multiple={false} />
          </motion.div>
        ) : (
          <motion.div
            key="action"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mx-auto flex max-w-xl flex-col items-center rounded-lg border border-border bg-surface p-8 text-center shadow-sm"
          >
            <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-lg ${result ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"}`}>
              {result ? <CheckCircle2 size={32} /> : <ShieldCheck size={32} />}
            </div>

            <h3 className="w-full truncate text-xl font-bold" title={file.name}>{file.name}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-foreground/65">
              {result
                ? "A sanitized copy is ready. The original file is unchanged."
                : "PaperDesk will clear title, author, subject, keywords, and producer metadata, then re-save a clean copy."}
            </p>

            <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row">
              <button
                onClick={() => {
                  setFile(null);
                  setResult(null);
                }}
                className="min-h-11 flex-1 rounded-lg border border-border px-5 text-sm font-semibold hover:bg-[var(--surface-muted)]"
              >
                {result ? "Process Another" : "Cancel"}
              </button>

              {result ? (
                <ActionButton className="flex-1" onClick={() => downloadFile(result, `Sanitized_${file.name}`)}>
                  <FileDown size={17} />
                  Download
                </ActionButton>
              ) : (
                <ActionButton className="flex-1" onClick={handleSanitize} isLoading={isProcessing} disabled={isProcessing}>
                  Sanitize PDF
                </ActionButton>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
