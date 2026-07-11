"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun, Menu, FilePlus } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

const titles: Record<string, string> = {
  "/": "Workspace",
  "/merge": "Merge PDF",
  "/split": "Split PDF",
  "/image-to-pdf": "Image to PDF",
  "/compress": "Compress PDF",
  "/sign": "Sign PDF",
  "/security": "Security",
  "/organize": "Organize Pages",
  "/watermark": "Watermark",
};

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const title = titles[pathname] ?? "PaperDesk";

  return (
    <header className="sticky top-0 z-40 mb-6 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white lg:hidden">
            <FilePlus size={19} />
          </Link>
          <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-border lg:hidden" aria-label="Open menu">
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">PaperDesk</p>
            <h1 className="truncate text-lg font-semibold md:text-xl">{title}</h1>
          </div>
        </div>

        <button
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface hover:bg-[var(--surface-muted)]"
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
    </header>
  );
}
