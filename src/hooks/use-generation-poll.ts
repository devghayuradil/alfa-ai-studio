"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/client/api";
import { type GenerationDTO, isTerminalStatus } from "@/types/video";

export interface PollingOptions {
  intervalMs: number;
  maxIntervalMs: number;
  maxDurationMs: number;
}

export type PollState = "idle" | "polling" | "done" | "timed-out" | "error";

const MAX_CONSECUTIVE_ERRORS = 5;

interface Stopped {
  id: string;
  reason: "timed-out" | "error";
}

/**
 * Poll a generation until it reaches a terminal state. The caller owns the
 * generation state and receives every update through `onUpdate`.
 *
 * - Backs off gradually (and faster after errors) up to maxIntervalMs.
 * - Stops after maxDurationMs or MAX_CONSECUTIVE_ERRORS failures — never infinite.
 * - Cancels the timer and in-flight request on unmount or when the id changes.
 */
export function useGenerationPoll(
  generation: GenerationDTO | null,
  options: PollingOptions | null,
  onUpdate: (generation: GenerationDTO) => void,
) {
  const [stopped, setStopped] = useState<Stopped | null>(null);
  const [warning, setWarning] = useState<{ id: string; message: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const id = generation?.id ?? null;
  const terminal = generation ? isTerminalStatus(generation.status) : false;

  useEffect(() => {
    if (!id || terminal || !options) return;

    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = options.intervalMs;
    let errors = 0;

    const tick = async () => {
      if (controller.signal.aborted) return;
      if (Date.now() - startedAt > options.maxDurationMs) {
        setStopped({ id, reason: "timed-out" });
        return;
      }
      try {
        const next = await api.getGeneration(id, controller.signal);
        if (controller.signal.aborted) return;
        errors = 0;
        setWarning(next.refreshWarning ? { id, message: next.refreshWarning.message } : null);
        onUpdateRef.current(next);
        if (isTerminalStatus(next.status)) return;
        delay = Math.min(options.maxIntervalMs, Math.round(delay * 1.15));
      } catch (err) {
        if (controller.signal.aborted) return;
        errors += 1;
        setWarning({
          id,
          message: err instanceof ApiError ? err.message : "Lost connection while checking status.",
        });
        const notFound = err instanceof ApiError && err.status === 404;
        if (notFound || errors >= MAX_CONSECUTIVE_ERRORS) {
          setStopped({ id, reason: "error" });
          return;
        }
        delay = Math.min(options.maxIntervalMs, delay * 2);
      }
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, Math.min(800, options.intervalMs));
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id, terminal, options, nonce]);

  const stoppedHere = stopped && stopped.id === id ? stopped : null;
  const state: PollState = !id ? "idle" : terminal ? "done" : stoppedHere ? stoppedHere.reason : "polling";

  const resume = useCallback(() => {
    setStopped(null);
    setNonce((n) => n + 1);
  }, []);

  return {
    state,
    warning: warning && warning.id === id && !terminal ? warning.message : null,
    resume,
  };
}
