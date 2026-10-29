import "server-only";

import path from "node:path";

import { getEnv } from "@/lib/env";
import type { AppErrorCode } from "@/lib/errors";
import { JsonDocumentStore } from "@/lib/storage/json-store";

/**
 * Remembers the last known availability of each real model, learned from
 * actual generation attempts. We never probe BytePlus just to check status
 * (that could cost money); the indicator updates when a real request
 * succeeds or fails with an access error.
 */
export type ModelAvailability = "unknown" | "available" | "not_open" | "not_found" | "auth_error" | "quota_exceeded";

export interface ModelStatusEntry {
  state: ModelAvailability;
  providerCode?: string;
  checkedAt: string;
}

interface ModelStatusDocument {
  id: string;
  models: Record<string, ModelStatusEntry>;
}

const DOC_ID = "byteplus";

const STATE_BY_ERROR: Partial<Record<AppErrorCode, ModelAvailability>> = {
  MODEL_NOT_OPEN: "not_open",
  MODEL_NOT_FOUND: "not_found",
  AUTH_ERROR: "auth_error",
  QUOTA_EXCEEDED: "quota_exceeded",
};

function store() {
  return new JsonDocumentStore<ModelStatusDocument>(path.join(getEnv().dataDir, "provider-status"));
}

export async function getModelStatuses(): Promise<Record<string, ModelStatusEntry>> {
  try {
    return (await store().get(DOC_ID))?.models ?? {};
  } catch {
    return {};
  }
}

async function setModelStatus(model: string, entry: ModelStatusEntry) {
  try {
    const current = (await store().get(DOC_ID)) ?? { id: DOC_ID, models: {} };
    current.models[model] = entry;
    await store().put(current);
  } catch {
    // Best effort; the indicator is informational only.
  }
}

export async function recordModelSuccess(model: string) {
  await setModelStatus(model, { state: "available", checkedAt: new Date().toISOString() });
}

export async function recordModelError(model: string, code: AppErrorCode, providerCode?: string) {
  const state = STATE_BY_ERROR[code];
  if (!state) return;
  await setModelStatus(model, { state, providerCode, checkedAt: new Date().toISOString() });
}
