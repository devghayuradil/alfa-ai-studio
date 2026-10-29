"use client";

import { Cpu, FlaskConical, Zap } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppConfig } from "@/hooks/use-app-config";
import { cn } from "@/lib/utils";
import type { ModelAvailabilityState } from "@/types/config";

export const AVAILABILITY: Record<ModelAvailabilityState, { label: string; dot: string; hint: string }> = {
  simulated: { label: "Simulated", dot: "bg-warning", hint: "Mock Mode — no API calls, no charges" },
  unknown: { label: "Not verified yet", dot: "bg-muted-foreground", hint: "Status updates after the first real generation" },
  available: { label: "Available", dot: "bg-success", hint: "Last real generation succeeded" },
  not_open: { label: "Not activated", dot: "bg-destructive", hint: "BytePlus returned ModelNotOpen" },
  not_found: { label: "Model ID not found", dot: "bg-destructive", hint: "Check ARK_MODEL" },
  auth_error: { label: "API key rejected", dot: "bg-destructive", hint: "Check ARK_API_KEY" },
  quota_exceeded: { label: "Quota exhausted", dot: "bg-destructive", hint: "No remaining balance or quota" },
  misconfigured: { label: "API key missing", dot: "bg-destructive", hint: "Set ARK_API_KEY" },
};

export function ProviderStatus({ className }: { className?: string }) {
  const { config, error } = useAppConfig();

  if (error) {
    return (
      <div className={cn("rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive", className)}>
        {error}
      </div>
    );
  }

  if (!config) {
    return (
      <div className={cn("space-y-2.5 rounded-xl border bg-white/[0.02] p-3", className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const model = config.models.find((m) => m.isDefault) ?? config.models[0];
  const availability = AVAILABILITY[model?.availability ?? "unknown"];

  return (
    <Link
      href="/settings"
      className={cn(
        "group block rounded-xl border bg-white/[0.02] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.04]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Provider</span>
        {config.mockMode ? (
          <Badge variant="warning">
            <FlaskConical /> Mock Mode
          </Badge>
        ) : (
          <Badge variant="success">
            <Zap /> BytePlus
          </Badge>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-xs">
        <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-[11px] text-foreground/90" title={model?.id}>
          {model?.id}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs" title={availability.hint}>
        <span className={cn("size-1.5 shrink-0 rounded-full", availability.dot)} />
        <span className="text-muted-foreground">{availability.label}</span>
      </div>
    </Link>
  );
}
