import "server-only";

import { AppError, isAppError } from "@/lib/errors";
import {
  type ArkCreateTaskResponse,
  type ArkTaskResponse,
  buildCreateTaskBody,
  type ImageWithBytes,
  normalizeArkStatus,
} from "@/lib/video/byteplus-payload";
import { normalizeArkError, normalizeArkTaskError, parseArkErrorBody } from "@/lib/video/byteplus-errors";
import type { VideoProvider } from "@/lib/video/provider";
import type { StoredImage, VideoRequest, VideoTask } from "@/types/video";

export interface BytePlusProviderOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  /** Loads reference image bytes from server-side storage. */
  readImage: (image: StoredImage) => Promise<Uint8Array>;
  fetchImpl?: typeof fetch;
}

const TASK_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * BytePlus ModelArk (Seedance) provider. Only constructed when
 * VIDEO_PROVIDER=byteplus is set explicitly; it is never used as a fallback.
 */
export class BytePlusVideoProvider implements VideoProvider {
  readonly name = "byteplus" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: BytePlusProviderOptions) {
    if (!options.apiKey) {
      throw new AppError("CONFIG_ERROR", "ARK_API_KEY is not configured on the server.");
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createTask(input: VideoRequest): Promise<VideoTask> {
    const images: { firstFrame?: ImageWithBytes; lastFrame?: ImageWithBytes } = {};
    if (input.firstFrame) {
      images.firstFrame = { image: input.firstFrame, bytes: await this.options.readImage(input.firstFrame) };
    }
    if (input.lastFrame) {
      images.lastFrame = { image: input.lastFrame, bytes: await this.options.readImage(input.lastFrame) };
    }

    const body = buildCreateTaskBody(input, images);
    const response = await this.request<ArkCreateTaskResponse>("/contents/generations/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response?.id || typeof response.id !== "string") {
      throw new AppError("PROVIDER_UNAVAILABLE", "BytePlus did not return a task ID.");
    }
    return { providerTaskId: response.id, status: "queued", providerStatus: "queued", isDemo: false };
  }

  async getTask(id: string): Promise<VideoTask> {
    if (!TASK_ID_PATTERN.test(id)) {
      throw new AppError("VALIDATION_ERROR", "Invalid task ID.");
    }
    const task = await this.request<ArkTaskResponse>(`/contents/generations/tasks/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    return mapArkTask(id, task);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      const name = (error as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AppError("PROVIDER_TIMEOUT", "BytePlus did not respond in time. Please try again.", {
          cause: error,
        });
      }
      throw new AppError("NETWORK_ERROR", "Could not reach BytePlus. Check your network connection.", {
        cause: error,
      });
    }

    const requestId = response.headers.get("x-request-id") ?? undefined;
    const text = await response.text().catch(() => "");
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    if (!response.ok) {
      const { code, message } = parseArkErrorBody(json);
      throw normalizeArkError({ httpStatus: response.status, code, message, requestId });
    }
    if (json === undefined) {
      throw new AppError("PROVIDER_UNAVAILABLE", "BytePlus returned an unreadable response.", { requestId });
    }
    return json as T;
  }
}

export function mapArkTask(id: string, task: ArkTaskResponse): VideoTask {
  const status = normalizeArkStatus(task.status);
  const result: VideoTask = {
    providerTaskId: task.id || id,
    status,
    providerStatus: task.status,
    isDemo: false,
  };
  if (status === "succeeded") {
    const url = task.content?.video_url;
    if (url && /^https:\/\//i.test(url)) {
      result.videoUrl = url;
    } else {
      result.status = "failed";
      result.error = {
        code: "TASK_FAILED",
        message: "The provider reported success but returned no video URL.",
        retryable: true,
      };
    }
  }
  if (status === "failed") {
    result.error = normalizeArkTaskError(task.error);
  }
  if (status === "cancelled") {
    result.error = { code: "TASK_FAILED", message: "The task was cancelled at the provider.", retryable: true };
  }
  return result;
}
