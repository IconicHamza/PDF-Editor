"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, type LucideIcon } from "lucide-react";

interface ToolCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  delay?: number;
}

export function ToolCard({ title, description, href, icon: Icon, delay = 0 }: ToolCardProps) {
  return (
    <Link href={href} className="block h-full">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay }}
        whileHover={{ y: -3 }}
        className="group flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-lg"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={22} />
          </div>
          <ArrowRight size={18} className="mt-2 text-foreground/35 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-foreground/65">{description}</p>
      </motion.div>
    </Link>
  );
}
