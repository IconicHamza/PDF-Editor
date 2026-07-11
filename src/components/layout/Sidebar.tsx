"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FilePlus,
  Split,
  Image as ImageIcon,
  Minimize,
  PenTool,
  ShieldCheck,
  Settings2,
  Droplet,
  LayoutDashboard,
} from "lucide-react";

const navItems = [
  { name: "Workspace", href: "/", icon: LayoutDashboard },
  { name: "Merge", href: "/merge", icon: FilePlus },
  { name: "Split", href: "/split", icon: Split },
  { name: "Images", href: "/image-to-pdf", icon: ImageIcon },
  { name: "Compress", href: "/compress", icon: Minimize },
  { name: "Sign", href: "/sign", icon: PenTool },
  { name: "Security", href: "/security", icon: ShieldCheck },
  { name: "Organize", href: "/organize", icon: Settings2 },
  { name: "Watermark", href: "/watermark", icon: Droplet },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-border bg-surface/95 px-4 py-5 lg:flex lg:flex-col">
      <Link href="/" className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
          <FilePlus size={20} />
        </div>
        <div>
          <div className="text-lg font-bold tracking-tight">PaperDesk</div>
          <div className="text-xs text-secondary opacity-70">PDF operations suite</div>
        </div>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "text-foreground/75 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
              }`}
            >
              <Icon size={18} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 rounded-lg border border-border bg-[var(--surface-muted)] p-4">
        <div className="text-sm font-semibold">Local-first</div>
        <p className="mt-1 text-xs leading-5 text-foreground/65">
          Files stay in the browser while edits are prepared for download.
        </p>
      </div>
    </aside>
  );
}
