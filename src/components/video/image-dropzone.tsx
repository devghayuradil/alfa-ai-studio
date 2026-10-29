"use client";

import { AlertCircle, ImagePlus, Loader2, Lock, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import { formatBytes } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import type { PublicAppConfig } from "@/types/config";

export interface UploadedImage {
  id: string;
  previewUrl: string;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
}

type Phase = { kind: "idle" } | { kind: "uploading"; previewUrl: string; name: string } | { kind: "error"; message: string };

interface ImageDropzoneProps {
  label: string;
  hint: string;
  value: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  onBusyChange?: (busy: boolean) => void;
  limits: PublicAppConfig["limits"];
  disabled?: boolean;
  disabledReason?: string;
  optional?: boolean;
  invalid?: string;
}

function readDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("decode"));
    img.src = url;
  });
}

export function ImageDropzone({
  label,
  hint,
  value,
  onChange,
  onBusyChange,
  limits,
  disabled,
  disabledReason,
  optional,
  invalid,
}: ImageDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleFile(file: File) {
    if (!limits.imageTypes.includes(file.type)) {
      setPhase({ kind: "error", message: "Use a PNG, JPEG or WebP image." });
      return;
    }
    if (file.size > limits.maxImageBytes) {
      setPhase({ kind: "error", message: `Image is ${formatBytes(file.size)} — max ${formatBytes(limits.maxImageBytes)}.` });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    try {
      const { width, height } = await readDimensions(previewUrl);
      const shortSide = Math.min(width, height);
      const longSide = Math.max(width, height);
      if (shortSide < limits.minImageSide || longSide > limits.maxImageSide) {
        URL.revokeObjectURL(previewUrl);
        setPhase({
          kind: "error",
          message: `Image is ${width}×${height}px. Sides must be ${limits.minImageSide}–${limits.maxImageSide}px.`,
        });
        return;
      }
    } catch {
      URL.revokeObjectURL(previewUrl);
      setPhase({ kind: "error", message: "This image could not be read. Try another file." });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "uploading", previewUrl, name: file.name });
    onBusyChange?.(true);
    try {
      const stored = await api.uploadImage(file, controller.signal);
      if (value) URL.revokeObjectURL(value.previewUrl);
      onChange({
        id: stored.id,
        previewUrl,
        name: file.name,
        width: stored.width,
        height: stored.height,
        sizeBytes: stored.sizeBytes,
      });
      setPhase({ kind: "idle" });
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      if (controller.signal.aborted) return;
      setPhase({ kind: "error", message: error instanceof ApiError ? error.message : "Upload failed." });
    } finally {
      onBusyChange?.(false);
    }
  }

  function clear() {
    abortRef.current?.abort();
    if (value) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setPhase({ kind: "idle" });
  }

  const preview = phase.kind === "uploading" ? phase.previewUrl : value?.previewUrl;
  const errorMessage = phase.kind === "error" ? phase.message : invalid;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-[13px] font-medium">
          {label}
          {optional && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">Optional</span>}
        </label>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="size-3" /> Replace
          </button>
        )}
      </div>

      <div
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) return;
          const file = event.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          "group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition-all",
          disabled
            ? "cursor-not-allowed border-white/10 bg-white/[0.01] opacity-60"
            : "cursor-pointer border-white/15 bg-white/[0.02] hover:border-primary/50 hover:bg-primary/[0.04]",
          dragging && "border-primary bg-primary/[0.08]",
          errorMessage && !disabled && "border-destructive/50",
          preview && "border-solid",
        )}
        onClick={() => !disabled && !preview && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={limits.imageTypes.join(",")}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />

        {disabled ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Lock className="size-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{disabledReason ?? "Not supported"}</span>
          </div>
        ) : preview ? (
          <>
            {/* Local object URL preview; next/image is not needed for blob: URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={`${label} preview`} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            {phase.kind === "uploading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs">
                  <Loader2 className="size-3.5 animate-spin" /> Uploading…
                </div>
              </div>
            ) : (
              value && (
                <>
                  <div className="absolute right-2 bottom-2 left-2 flex items-end justify-between gap-2 text-[11px] text-white/85">
                    <span className="truncate">{value.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {value.width}×{value.height}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    aria-label={`Remove ${label}`}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80"
                    onClick={(event) => {
                      event.stopPropagation();
                      clear();
                    }}
                  >
                    <X />
                  </Button>
                </>
              )
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <div className="rounded-xl bg-white/[0.05] p-2.5 transition-transform group-hover:scale-105">
              <ImagePlus className="size-5 text-muted-foreground group-hover:text-primary" />
            </div>
            <span className="text-xs font-medium">Drop or click to upload</span>
            <span className="text-[11px] text-muted-foreground">{hint}</span>
          </div>
        )}
      </div>

      {errorMessage && !disabled && (
        <p className="flex items-start gap-1.5 text-[11.5px] text-destructive">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {errorMessage}
        </p>
      )}
    </div>
  );
}
