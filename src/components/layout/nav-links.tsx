"use client";

import { Clapperboard, History, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Create Video", icon: Clapperboard },
  { href: "/history", label: "Generation History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
              active
                ? "bg-white/[0.07] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            {active && <span className="bg-brand-gradient absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full" />}
            <Icon className={cn("size-4 transition-colors", active ? "text-primary" : "group-hover:text-foreground")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
