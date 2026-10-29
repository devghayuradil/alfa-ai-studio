"use client";

import { Download, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { aspectClass, frameStyle } from "@/components/video/aspect-icon";
import { DemoLabel } from "@/components/video/demo-label";
import { downloadUrl } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { GenerationRecord } from "@/types/video";

export function VideoPlayer({
  generation,
  className,
  autoPlay = true,
  maxHeight = "68vh",
}: {
  generation: GenerationRecord;
  className?: string;
  autoPlay?: boolean;
  maxHeight?: string;
}) {
  if (!generation.videoUrl) return null;
  return (
    <div
      className={cn("relative mx-auto overflow-hidden rounded-xl bg-black", aspectClass(generation.aspectRatio), className)}
      style={frameStyle(generation.aspectRatio, maxHeight)}
    >
      <video
        key={generation.videoUrl}
        src={generation.videoUrl}
        className="absolute inset-0 size-full object-contain"
        controls
        playsInline
        loop
        muted={autoPlay}
        autoPlay={autoPlay}
        preload="metadata"
      />
      {generation.isDemo && <DemoLabel className="absolute top-3 left-3" />}
    </div>
  );
}

export function VideoActions({ generation, size = "sm" }: { generation: GenerationRecord; size?: "sm" | "default" }) {
  if (generation.status !== "succeeded" || !generation.videoUrl) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size={size} variant="secondary">
        <a href={downloadUrl(generation.id)} download>
          <Download /> Download{generation.isDemo ? " demo" : ""}
        </a>
      </Button>
      <Button asChild size={size} variant="ghost">
        <a href={generation.videoUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink /> Open
        </a>
      </Button>
    </div>
  );
}
