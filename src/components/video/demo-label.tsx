import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";

/** Always shown on top of mock output so it is never mistaken for AI output. */
export function DemoLabel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-warning shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <FlaskConical className="size-3.5" />
      Demo Video — Not AI Generated
    </div>
  );
}
