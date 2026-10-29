"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Per-browser conveniences only (never authoritative state). */
export interface Preferences {
  simulateFailure: boolean;
}

const KEY = "alfa-ai-studio:preferences";
const DEFAULTS: Preferences = { simulateFailure: false };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: Preferences = DEFAULTS;

function read(): Preferences {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    cachedValue = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULTS;
  } catch {
    cachedValue = DEFAULTS;
  }
  return cachedValue;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const update = useCallback((patch: Partial<Preferences>) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
    } catch {
      // Storage unavailable (private mode) — preference just won't persist.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [preferences, update] as const;
}
