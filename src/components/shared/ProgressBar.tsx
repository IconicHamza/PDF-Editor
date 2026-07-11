"use client";

import { motion } from "framer-motion";

interface ProgressBarProps {
  progress: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ progress, label = "Processing...", className = "" }: ProgressBarProps) {
  // Ensure progress is bound between 0 and 100
  const validProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className={`mt-4 w-full max-w-sm space-y-2 ${className}`}>
      <div className="flex justify-between text-xs font-medium text-secondary">
        <span>{label}</span>
        <span>{validProgress}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${validProgress}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        />
      </div>
    </div>
  );
}
