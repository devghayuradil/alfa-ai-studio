import { Clock, Image as ImageIcon, Monitor, Ratio, Type, Volume2 } from "lucide-react";

import { MODE_LABELS } from "@/lib/client/format";
import { getCapabilities } from "@/lib/video/capabilities";
import { cn } from "@/lib/utils";
import type { GenerationRecord } from "@/types/video";

export function GenerationMeta({
  generation,
  className,
  showModel = true,
}: {
  generation: Pick<GenerationRecord, "mode" | "model" | "duration" | "aspectRatio" | "resolution" | "generateAudio">;
  className?: string;
  showModel?: boolean;
}) {
  const ModeIcon = generation.mode === "image-to-video" ? ImageIcon : Type;
  const chips = [
    { icon: ModeIcon, label: MODE_LABELS[generation.mode] },
    { icon: Clock, label: `${generation.duration}s` },
    { icon: Ratio, label: generation.aspectRatio === "adaptive" ? "Adaptive" : generation.aspectRatio },
    { icon: Monitor, label: generation.resolution },
    ...(generation.generateAudio ? [{ icon: Volume2, label: "Audio" }] : []),
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {showModel && (
        <span className="rounded-md border bg-white/[0.03] px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
          {getCapabilities(generation.model).label}
        </span>
      )}
      {chips.map(({ icon: Icon, label }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          <Icon className="size-3" />
          {label}
        </span>
      ))}
    </div>
  );
}
