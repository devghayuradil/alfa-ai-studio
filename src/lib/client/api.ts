import type { ApiErrorBody, FieldIssue } from "@/lib/errors";
import type { CreateVideoInput } from "@/lib/validations/video";
import type { PublicAppConfig } from "@/types/config";
import type { GenerationDTO, GenerationRecord, StoredImage } from "@/types/video";

/** Error thrown by the browser API client; mirrors the server's error body. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryable = false,
    readonly issues: FieldIssue[] = [],
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function request<T>(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal, cache: "no-store" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (timeout.aborted) {
      throw new ApiError("The server took too long to respond.", "CLIENT_TIMEOUT", 0, true);
    }
    throw new ApiError("Network error — check your connection and that the dev server is running.", "NETWORK_ERROR", 0, true);
  }

  if (response.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const error = (body as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      error?.message ?? `Request failed (${response.status}).`,
      error?.code ?? "HTTP_ERROR",
      response.status,
      error?.retryable ?? response.status >= 500,
      error?.issues ?? [],
      error?.providerCode,
    );
  }
  return body as T;
}

export const api = {
  getConfig: (signal?: AbortSignal) => request<PublicAppConfig>("/api/health", { signal }),

  listGenerations: (limit = 100, signal?: AbortSignal) =>
    request<{ generations: GenerationDTO[] }>(`/api/videos?limit=${limit}`, { signal }).then((r) => r.generations),

  getGeneration: (id: string, signal?: AbortSignal) =>
    request<{ generation: GenerationDTO }>(`/api/videos/${encodeURIComponent(id)}`, { signal }).then(
      (r) => r.generation,
    ),

  createGeneration: (input: CreateVideoInput) =>
    request<{ generation: GenerationRecord; duplicate: boolean }>(
      "/api/videos",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      60_000,
    ),

  deleteGeneration: (id: string) => request<void>(`/api/videos/${encodeURIComponent(id)}`, { method: "DELETE" }),

  uploadImage: (file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ image: StoredImage }>("/api/uploads", { method: "POST", body: form, signal }, 60_000).then(
      (r) => r.image,
    );
  },
};

export function downloadUrl(id: string) {
  return `/api/videos/${encodeURIComponent(id)}/download`;
}

export function uploadUrl(id: string) {
  return `/api/uploads/${encodeURIComponent(id)}`;
}
