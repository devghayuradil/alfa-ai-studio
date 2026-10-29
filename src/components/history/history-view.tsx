"use client";

import { AlertCircle, Clapperboard, Eye, Film, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoLabel } from "@/components/video/demo-label";
import { GenerationMeta } from "@/components/video/generation-meta";
import { StatusBadge } from "@/components/video/status-badge";
import { VideoActions, VideoPlayer } from "@/components/video/video-player";
import { api, ApiError, uploadUrl } from "@/lib/client/api";
import { formatDateTime, formatRelativeTime } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { type GenerationDTO, isTerminalStatus } from "@/types/video";

type Filter = "all" | "succeeded" | "active" | "failed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "succeeded", label: "Completed" },
  { value: "active", label: "In progress" },
  { value: "failed", label: "Failed" },
];

const REFRESH_INTERVAL_MS = 4_000;
const MAX_AUTO_REFRESH_MS = 15 * 60_000;

function matchesFilter(generation: GenerationDTO, filter: Filter) {
  switch (filter) {
    case "succeeded":
      return generation.status === "succeeded";
    case "active":
      return !isTerminalStatus(generation.status);
    case "failed":
      return generation.status === "failed" || generation.status === "cancelled";
    default:
      return true;
  }
}

export function HistoryView() {
  const [generations, setGenerations] = useState<GenerationDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const items = await api.listGenerations(200, signal);
      setGenerations(items);
      setError(null);
      return items;
    } catch (err) {
      if (signal?.aborted) return null;
      setError(err instanceof ApiError ? err.message : "Could not load history.");
      return null;
    }
  }, []);

  // Initial load, then keep refreshing while any task is still in flight (bounded).
  useEffect(() => {
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const items = await load(controller.signal);
      if (controller.signal.aborted) return;
      const hasActive = items?.some((item) => !isTerminalStatus(item.status));
      if (hasActive && Date.now() - startedAt < MAX_AUTO_REFRESH_MS) {
        timer = setTimeout(run, REFRESH_INTERVAL_MS);
      }
    };
    void run();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [load, reloadKey]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (generations ?? []).filter(
      (generation) =>
        matchesFilter(generation, filter) &&
        (!needle || generation.prompt.toLowerCase().includes(needle) || generation.model.toLowerCase().includes(needle)),
    );
  }, [generations, filter, query]);

  const selected = generations?.find((generation) => generation.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const all = generations ?? [];
    return Object.fromEntries(FILTERS.map((f) => [f.value, all.filter((g) => matchesFilter(g, f.value)).length])) as Record<
      Filter,
      number
    >;
  }, [generations]);

  async function remove(generation: GenerationDTO) {
    try {
      await api.deleteGeneration(generation.id);
      setGenerations((items) => items?.filter((item) => item.id !== generation.id) ?? null);
      if (selectedId === generation.id) setSelectedId(null);
      toast.success("Removed from history");
    } catch (err) {
      toast.error("Could not delete", { description: err instanceof ApiError ? err.message : undefined });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Generation History"
        description="Every generation you've started, with its settings, status and output."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw /> Refresh
            </Button>
            <Button asChild variant="brand" size="sm">
              <Link href="/">
                <Clapperboard /> New video
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList className="max-w-full overflow-x-auto">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
                {generations && <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">{counts[f.value]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search prompts or models…"
            className="pl-9"
            aria-label="Search history"
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>History unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {generations === null && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border p-3">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : generations && generations.length === 0 ? (
        <EmptyHistory />
      ) : visible.length === 0 && generations ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-muted-foreground">
          No generations match this filter.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((generation) => (
            <HistoryCard key={generation.id} generation={generation} onOpen={() => setSelectedId(generation.id)} onDelete={() => remove(generation)} />
          ))}
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Generation details <StatusBadge status={selected.status} />
              </DialogTitle>
              <DialogDescription>{formatDateTime(selected.createdAt)}</DialogDescription>
            </DialogHeader>
            <GenerationDetails generation={selected} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function HistoryCard({
  generation,
  onOpen,
  onDelete,
}: {
  generation: GenerationDTO;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const failed = generation.status === "failed" || generation.status === "cancelled";

  return (
    <article className="surface group flex flex-col overflow-hidden rounded-2xl border bg-card/50 transition-colors hover:border-white/15">
      <button type="button" onClick={onOpen} className="relative aspect-video w-full cursor-pointer overflow-hidden bg-black/40 text-left">
        {generation.status === "succeeded" && generation.videoUrl ? (
          <video
            src={generation.videoUrl}
            muted
            playsInline
            loop
            preload="metadata"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : failed ? (
          <div className="flex size-full items-center justify-center bg-destructive/[0.05]">
            <XCircle className="size-7 text-destructive/60" />
          </div>
        ) : (
          <div className="shimmer flex size-full items-center justify-center">
            <Film className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <StatusBadge status={generation.status} className="bg-black/60 backdrop-blur" />
        </div>
        {generation.isDemo && generation.status === "succeeded" && (
          <DemoLabel className="absolute right-2.5 bottom-2.5 px-2 py-0.5 text-[10px]" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs backdrop-blur">
            <Eye className="size-3.5" /> View details
          </span>
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/90" title={generation.prompt}>
          {generation.prompt}
        </p>
        <GenerationMeta generation={generation} />
        {failed && generation.error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/[0.05] px-2.5 py-2 text-[11.5px] text-destructive/90">
            <span className="font-medium">{generation.error.providerCode ?? generation.error.code}:</span> {generation.error.message}
          </div>
        )}
        {generation.refreshWarning && (
          <p className="text-[11px] text-warning">{generation.refreshWarning.message}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground" title={formatDateTime(generation.createdAt)}>
            {formatRelativeTime(generation.createdAt)}
          </span>
          <div className="flex items-center gap-1">
            <VideoActions generation={generation} />
            {confirming ? (
              <Button size="sm" variant="destructive" onClick={onDelete} onBlur={() => setConfirming(false)} autoFocus>
                Confirm
              </Button>
            ) : (
              <Button size="icon-sm" variant="ghost" aria-label="Delete from history" onClick={() => setConfirming(true)}>
                <Trash2 />
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function GenerationDetails({ generation }: { generation: GenerationDTO }) {
  const rows: [string, string][] = [
    ["Model", generation.model],
    ["Provider", generation.provider === "mock" ? "Mock Mode" : "BytePlus ModelArk"],
    ["Task ID", generation.providerTaskId],
    ["Duration", `${generation.duration}s`],
    ["Aspect ratio", generation.aspectRatio],
    ["Resolution", generation.resolution],
    ["Watermark", generation.watermark ? "On" : "Off"],
    ["Audio", generation.generateAudio ? "On" : "Off"],
    ["Fixed camera", generation.cameraFixed ? "On" : "Off"],
    ...(generation.seed !== undefined ? ([["Seed", String(generation.seed)]] as [string, string][]) : []),
    ...(generation.completedAt ? ([["Completed", formatDateTime(generation.completedAt)]] as [string, string][]) : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {generation.status === "succeeded" && generation.videoUrl ? (
        <VideoPlayer generation={generation} maxHeight="55vh" />
      ) : generation.error ? (
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>{generation.error.providerCode ?? generation.error.code}</AlertTitle>
          <AlertDescription>{generation.error.message}</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="info">
          <Film />
          <AlertTitle>Still processing</AlertTitle>
          <AlertDescription>This task hasn&apos;t finished yet. The list refreshes automatically.</AlertDescription>
        </Alert>
      )}

      <VideoActions generation={generation} size="default" />

      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">Prompt</div>
        <p className="rounded-xl border bg-white/[0.02] p-3 text-[13px] leading-relaxed whitespace-pre-wrap">{generation.prompt}</p>
      </div>

      {(generation.firstFrameId || generation.lastFrameId) && (
        <div className="flex gap-3">
          {[
            ["First frame", generation.firstFrameId],
            ["Last frame", generation.lastFrameId],
          ].map(([label, id]) =>
            id ? (
              <figure key={label} className="w-32">
                {/* Served by /api/uploads/[id]; small local thumbnail. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadUrl(id)} alt={label} className="aspect-[4/3] w-full rounded-lg border object-cover" />
                <figcaption className="mt-1 text-[11px] text-muted-foreground">{label}</figcaption>
              </figure>
            ) : null,
          )}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border bg-white/[0.015] p-3 text-[12.5px] sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn("truncate text-right", (label === "Task ID" || label === "Model") && "font-mono text-[11px]")} title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      <div className="bg-brand-gradient flex size-12 items-center justify-center rounded-2xl">
        <Film className="size-5 text-white" />
      </div>
      <div>
        <div className="font-medium">No generations yet</div>
        <p className="mt-1 text-sm text-muted-foreground">Create your first video and it will appear here.</p>
      </div>
      <Button asChild variant="brand">
        <Link href="/">
          <Clapperboard /> Create video
        </Link>
      </Button>
    </div>
  );
}
