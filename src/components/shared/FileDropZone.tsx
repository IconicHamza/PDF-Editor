"use client";

import { useRef, useState } from "react";
import { File as FileIcon, UploadCloud } from "lucide-react";
import { motion } from "framer-motion";

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
}

function acceptsFile(file: File, accept: string) {
  const rules = accept.split(",").map((rule) => rule.trim()).filter(Boolean);
  return rules.some((rule) => {
    if (rule.endsWith("/*")) return file.type.startsWith(rule.replace("/*", "/"));
    if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule.toLowerCase());
    return file.type === rule;
  });
}

export function FileDropZone({
  onFilesSelected,
  accept = "application/pdf",
  multiple = true,
  maxFiles = 50,
}: FileDropZoneProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter((file) => acceptsFile(file, accept)).slice(0, maxFiles);

    if (validFiles.length === 0) {
      setError("This tool only accepts the supported file type.");
      return;
    }

    setError("");
    onFilesSelected(validFiles);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsHovering(true);
      }}
      onDragLeave={() => setIsHovering(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsHovering(false);
        handleFiles(Array.from(event.dataTransfer.files));
      }}
      onClick={() => inputRef.current?.click()}
      className={`
        flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-lg
        border-2 border-dashed p-8 text-center transition-colors md:p-12
        ${isHovering ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-primary/60"}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        onChange={(event) => handleFiles(Array.from(event.target.files ?? []))}
        accept={accept}
        multiple={multiple}
        className="hidden"
      />

      <motion.div
        animate={{ y: isHovering ? -6 : 0 }}
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-primary"
      >
        {isHovering ? <FileIcon size={30} /> : <UploadCloud size={32} />}
      </motion.div>

      <h3 className="text-xl font-semibold">Drop files here or browse</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-foreground/65">
        {multiple ? `Add up to ${maxFiles} files.` : "Add one file."} Supported:{" "}
        {accept.includes("image") ? "JPG, PNG, or WebP" : "PDF"}.
      </p>
      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
