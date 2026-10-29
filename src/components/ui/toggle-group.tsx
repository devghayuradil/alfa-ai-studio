"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("flex w-full flex-wrap gap-1.5", className)}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-9 min-w-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-white/[0.02] px-2.5 text-[13px] font-medium text-muted-foreground transition-all outline-none hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 data-[state=on]:border-primary/60 data-[state=on]:bg-primary/12 data-[state=on]:text-foreground data-[state=on]:shadow-[inset_0_0_0_1px] data-[state=on]:shadow-primary/30 [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
