import type * as React from "react";

import { cn } from "@/lib/utils";
import type { AspectRatio } from "@/types/video";

const SIZES: Record<Exclude<AspectRatio, "adaptive">, string> = {
  "16:9": "h-2.5 w-[18px]",
  "9:16": "h-[18px] w-2.5",
  "1:1": "size-3.5",
};

export function AspectIcon({ ratio, className }: { ratio: AspectRatio; className?: string }) {
  if (ratio === "adaptive") {
    return <span className={cn("inline-block size-3.5 rounded-[3px] border-[1.5px] border-dashed border-current", className)} />;
  }
  return <span className={cn("inline-block rounded-[3px] border-[1.5px] border-current", SIZES[ratio], className)} />;
}

export function aspectClass(ratio: AspectRatio): string {
  switch (ratio) {
    case "9:16":
      return "aspect-[9/16]";
    case "1:1":
      return "aspect-square";
    default:
      return "aspect-video";
  }
}

/**
 * Size a media frame so it fits within `maxHeight` without collapsing.
 * Portrait frames are sized by height; landscape/square frames by width.
 */
export function frameStyle(ratio: AspectRatio, maxHeight: string): React.CSSProperties {
  switch (ratio) {
    case "9:16":
      return { height: maxHeight, maxWidth: "100%" };
    case "1:1":
      return { width: "100%", maxWidth: maxHeight };
    default:
      return { width: "100%", maxWidth: `calc(${maxHeight} * 16 / 9)` };
  }
}
