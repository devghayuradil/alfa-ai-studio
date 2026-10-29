"use client";

import { AlertTriangle, Check, Clapperboard, Copy, Loader2, RefreshCw, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { aspectClass, frameStyle } from "@/components/video/aspect-icon";
import { GenerationMeta } from "@/components/video/generation-meta";
import { StatusBadge } from "@/components/video/status-badge";
import { VideoActions, VideoPlayer } from "@/components/video/video-player";
import type { PollState } from "@/hooks/use-generation-poll";
import { useNow } from "@/hooks/use-now";
import { formatElapsed } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { type GenerationDTO, isTerminalStatus } from "@/types/video";

interface PreviewStageProps {
  generation: GenerationDTO | null;
  submitting: boolean;
  pollState: PollState;
  pollWarning: string | null;
  mockMode: boolean;
  onResume: () => void;
  onRetry: () => void;
}

const STEPS = ["Submitted", "Queued", "Generating", "Ready"] as const;

function stepIndex(generation: GenerationDTO | null, submitting: boolean): number {
  if (!generation) return submitting ? 0 : -1;
  switch (generation.status) {
    case "queued":
      return 1;
    case "running":
      return 2;
    case "succeeded":
      return 3;
    default:
      return 2;
  }
}

export function PreviewStage({ generation, submitting, pollState, pollWarning, mockMode, onResume, onRetry }: PreviewStageProps) {
  const inFlight = submitting || (generation !== null && !isTerminalStatus(generation.status));
  const now = useNow(1000, inFlight);
  const current = stepIndex(generation, submitting);

  if (!generation && !submitting) return <EmptyStage mockMode={mockMode} />;

  const ratio = generation?.aspectRatio ?? "16:9";
  const elapsed = generation ? now - Date.parse(generation.createdAt) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {generation ? (
            <StatusBadge status={generation.status} />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Submitting…
            </span>
          )}
          {inFlight && generation && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatElapsed(elapsed)}</span>
          )}
        </div>
        {generation && <VideoActions generation={generation} />}
      </div>

      {generation?.status === "succeeded" && generation.videoUrl ? (
        <VideoPlayer generation={generation} maxHeight="min(64vh, 640px)" />
      ) : generation && (generation.status === "failed" || generation.status === "cancelled") ? (
        <FailedPanel generation={generation} onRetry={onRetry} />
      ) : (
        <div
          className={cn(
            "relative mx-auto flex items-center justify-center overflow-hidden rounded-xl border bg-black/40",
            aspectClass(ratio),
          )}
          style={frameStyle(ratio, "min(64vh, 640px)")}
        >
          <div className="bg-grid absolute inset-0 opacity-60" />
          <div className="bg-brand-gradient absolute size-2/3 animate-pulse rounded-full opacity-[0.18] blur-3xl" />
          <div className="shimmer absolute inset-0" />
          <div className="relative flex flex-col items-center gap-3 px-6 text-center">
            <div className="animate-pulse-ring flex size-12 items-center justify-center rounded-full bg-white/10 backdrop-blur">
              <Sparkles className="size-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-medium">
                {!generation ? "Sending request…" : generation.status === "queued" ? "Waiting in queue" : "Generating your video"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {mockMode ? "Mock Mode — simulating a Seedance task" : "This usually takes 1–5 minutes"}
              </div>
            </div>
            {generation?.progress !== undefined && generation.status === "running" && (
              <div className="w-48">
                <Progress value={generation.progress} />
                <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">{generation.progress}%</div>
              </div>
            )}
          </div>
        </div>
      )}

      {inFlight && (
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((label, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <li key={label} className="flex flex-col gap-1.5">
                <div
                  className={cn(
                    "h-1 rounded-full transition-colors duration-500",
                    done ? "bg-primary" : active ? "bg-primary/50" : "bg-white/[0.07]",
                  )}
                />
                <span className={cn("flex items-center gap-1 text-[11px]", done || active ? "text-foreground" : "text-muted-foreground")}>
                  {done && <Check className="size-3 text-primary" />}
                  {active && <Loader2 className="size-3 animate-spin text-primary" />}
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {pollWarning && pollState === "polling" && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Status check delayed</AlertTitle>
          <AlertDescription>{pollWarning} We&apos;ll keep trying.</AlertDescription>
        </Alert>
      )}

      {(pollState === "timed-out" || pollState === "error") && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>{pollState === "timed-out" ? "Still processing" : "Stopped checking status"}</AlertTitle>
          <AlertDescription>
            <p>
              {pollState === "timed-out"
                ? "This is taking longer than usual. The task keeps running — you can check again or find it later in History."
                : (pollWarning ?? "Repeated errors while checking the task status.")}
            </p>
            <Button size="sm" variant="outline" className="mt-1" onClick={onResume}>
              <RefreshCw /> Check again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {generation && (
        <div className="rounded-xl border bg-white/[0.02] p-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-3 text-[13px] leading-relaxed text-foreground/90">{generation.prompt}</p>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Copy prompt"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(generation.prompt)
                  .then(() => toast.success("Prompt copied"))
                  .catch(() => toast.error("Could not copy"));
              }}
            >
              <Copy />
            </Button>
          </div>
          <GenerationMeta generation={generation} className="mt-2.5" />
        </div>
      )}
    </div>
  );
}

function FailedPanel({ generation, onRetry }: { generation: GenerationDTO; onRetry: () => void }) {
  const error = generation.error;
  return (
    <div
      className={cn(
        "relative mx-auto flex items-center justify-center overflow-hidden rounded-xl border border-destructive/25 bg-destructive/[0.04]",
        aspectClass(generation.aspectRatio),
      )}
      style={frameStyle(generation.aspectRatio, "min(64vh, 640px)")}
    >
      <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-destructive/15">
          <XCircle className="size-5 text-destructive" />
        </div>
        <div>
          <div className="text-sm font-medium">{generation.status === "cancelled" ? "Generation cancelled" : "Generation failed"}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error?.message ?? "The provider did not return details."}</p>
          {(error?.providerCode || error?.code) && (
            <code className="mt-2 inline-block rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {error.providerCode ?? error.code}
            </code>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
      </div>
    </div>
  );
}

function EmptyStage({ mockMode }: { mockMode: boolean }) {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/10 bg-white/[0.015]">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        <div className="animate-float relative">
          <div className="bg-brand-gradient absolute inset-0 rounded-2xl opacity-40 blur-xl" />
          <div className="bg-brand-gradient relative flex size-14 items-center justify-center rounded-2xl">
            <Clapperboard className="size-6 text-white" />
          </div>
        </div>
        <div>
          <div className="text-[15px] font-medium">Your video will appear here</div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Describe a scene, pick your settings and hit Generate. You can watch the task progress live.
            {mockMode && " In Mock Mode a labeled demo clip is returned — no API calls, no charges."}
          </p>
        </div>
      </div>
    </div>
  );
}
