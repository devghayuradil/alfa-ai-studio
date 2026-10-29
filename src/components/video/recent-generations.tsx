"use client";

import { ArrowRight, Film } from "lucide-react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/video/status-badge";
import { formatRelativeTime } from "@/lib/client/format";
import { getCapabilities } from "@/lib/video/capabilities";
import { cn } from "@/lib/utils";
import type { GenerationDTO } from "@/types/video";

export function RecentGenerations({
  generations,
  loading,
  activeId,
  onSelect,
}: {
  generations: GenerationDTO[];
  loading: boolean;
  activeId: string | null;
  onSelect: (generation: GenerationDTO) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recent generations</h2>
        <Link href="/history" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          View all <ArrowRight className="size-3" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-video w-full rounded-lg" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : generations.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">
          <Film className="size-4" /> No generations yet — your first one will show up here.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {generations.slice(0, 6).map((generation) => (
            <button
              key={generation.id}
              type="button"
              onClick={() => onSelect(generation)}
              className={cn(
                "group flex cursor-pointer flex-col gap-2 rounded-xl border bg-white/[0.02] p-2 text-left transition-all hover:border-white/15 hover:bg-white/[0.04]",
                activeId === generation.id && "border-primary/50 bg-primary/[0.05]",
              )}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black/40">
                {generation.status === "succeeded" && generation.videoUrl ? (
                  <video
                    src={generation.videoUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                ) : (
                  <div className={cn("size-full", generation.status === "failed" ? "bg-destructive/[0.06]" : "shimmer")} />
                )}
                <StatusBadge status={generation.status} className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur" />
              </div>
              <div className="min-w-0 px-0.5">
                <p className="truncate text-xs text-foreground/90">{generation.prompt}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {getCapabilities(generation.model).label} · {formatRelativeTime(generation.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
