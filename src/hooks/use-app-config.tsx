"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/client/api";
import type { PublicAppConfig } from "@/types/config";

interface AppConfigState {
  config: PublicAppConfig | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const AppConfigContext = createContext<AppConfigState | null>(null);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicAppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getConfig(controller.signal)
      .then((next) => {
        setConfig(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "Could not load configuration.");
      });
    return () => controller.abort();
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <AppConfigContext.Provider value={{ config, loading: !config && !error, error, reload }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfigState {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error("useAppConfig must be used inside AppConfigProvider");
  return ctx;
}
