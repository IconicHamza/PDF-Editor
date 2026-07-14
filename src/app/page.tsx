"use client";

import { ToolCard } from "@/components/shared/ToolCard";
import {
  FilePlus,
  Split,
  Image as ImageIcon,
  Minimize,
  PenTool,
  ShieldCheck,
  Settings2,
  Droplet,
  Clock3,
  Files,
  LockKeyhole,
  Type,
} from "lucide-react";

const tools = [
  {
    title: "Merge PDFs",
    description: "Combine contracts, reports, invoices, or scans into one ordered document.",
    href: "/merge",
    icon: FilePlus,
  },
  {
    title: "Split pages",
    description: "Extract exact pages using thumbnails or a typed page range.",
    href: "/split",
    icon: Split,
  },
  {
    title: "Images to PDF",
    description: "Turn JPG, PNG, and WebP files into a clean A4 PDF.",
    href: "/image-to-pdf",
    icon: ImageIcon,
  },
  {
    title: "Compress",
    description: "Re-save documents with object streams and cleaned metadata.",
    href: "/compress",
    icon: Minimize,
  },
  {
    title: "E-sign",
    description: "Draw a signature, place it on the preview, and export a signed copy.",
    href: "/sign",
    icon: PenTool,
  },
  {
    title: "Secure",
    description: "Prepare privacy-safe files by removing document metadata before sharing.",
    href: "/security",
    icon: ShieldCheck,
  },
  {
    title: "Organize pages",
    description: "Reorder, rotate, and remove pages with a visual page board.",
    href: "/organize",
    icon: Settings2,
  },
  {
    title: "Watermark",
    description: "Apply branded or confidential text marks across every page.",
    href: "/watermark",
    icon: Droplet,
  },
  {
    title: "Edit Text",
    description: "Click any text in the document and edit it directly inline.",
    href: "/edit",
    icon: Type,
  },
];

const stats = [
  { label: "Browser-side tools", value: "8", icon: Files },
  { label: "Upload required", value: "0", icon: LockKeyhole },
  { label: "Typical flow", value: "2 min", icon: Clock3 },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">PDF operations workspace</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight md:text-5xl">
              Edit, assemble, and prepare PDFs without sending files away.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/70">
              PaperDesk gives you the core document workflows in one focused interface: merge, split, organize, sign,
              watermark, compress, and convert images.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex items-center gap-3 rounded-lg border border-border bg-[var(--surface-muted)] p-4">
                  <Icon size={18} className="text-primary" />
                  <div>
                    <div className="text-lg font-bold">{stat.value}</div>
                    <div className="text-xs text-foreground/60">{stat.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Tools</h3>
            <p className="mt-1 text-sm text-foreground/60">Choose a workflow and export a fresh copy when done.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tools.map((tool, index) => (
            <ToolCard key={tool.href} {...tool} delay={index * 0.03} />
          ))}
        </div>
      </section>
    </div>
  );
}
