import "server-only";

import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/errors";
import { JsonDocumentStore } from "@/lib/storage/json-store";
import type { VideoProvider } from "@/lib/video/provider";
import type { AspectRatio, MockOutcome, VideoRequest, VideoTask } from "@/types/video";

/** Bundled, self-made demo clips in /public/demo. Clearly labeled "Demo Video — Not AI Generated". */
export const DEMO_VIDEOS: Record<Exclude<AspectRatio, "adaptive">, string> = {
  "16:9": "/demo/demo-16x9.mp4",
  "9:16": "/demo/demo-9x16.mp4",
  "1:1": "/demo/demo-1x1.mp4",
};

export function demoVideoFor(aspectRatio: AspectRatio): string {
  return aspectRatio === "adaptive" ? DEMO_VIDEOS["16:9"] : DEMO_VIDEOS[aspectRatio];
}

/** Prompt keyword that forces a simulated failure (handy for manual testing). */
export const MOCK_FAIL_KEYWORD = "#fail";

export interface MockTaskDocument {
  id: string;
  createdAt: number;
  queueMs: number;
  runMs: number;
  outcome: MockOutcome;
  aspectRatio: AspectRatio;
  model: string;
}

export interface MockProviderOptions {
  store: JsonDocumentStore<MockTaskDocument>;
  queueMs: number;
  runMs: number;
  now?: () => number;
}

/**
 * Simulated provider. It never touches the network and never costs money.
 *
 * Task state is not mutated over time; it is derived from the creation
 * timestamp on every read (queued → running → succeeded/failed). The only
 * write is at creation, persisted to disk, so polling works across workers,
 * hot reloads and page refreshes.
 */
export class MockVideoProvider implements VideoProvider {
  readonly name = "mock" as const;
  private readonly now: () => number;

  constructor(private readonly options: MockProviderOptions) {
    this.now = options.now ?? Date.now;
  }

  async createTask(input: VideoRequest): Promise<VideoTask> {
    const outcome: MockOutcome =
      input.mockOutcome === "failure" || input.prompt.toLowerCase().includes(MOCK_FAIL_KEYWORD)
        ? "failure"
        : "success";

    const doc: MockTaskDocument = {
      id: `mock-${randomUUID()}`,
      createdAt: this.now(),
      queueMs: this.options.queueMs,
      runMs: this.options.runMs,
      outcome,
      aspectRatio: input.aspectRatio,
      model: input.model,
    };
    await this.options.store.put(doc);
    return this.toTask(doc);
  }

  async getTask(id: string): Promise<VideoTask> {
    const doc = await this.options.store.get(id);
    if (!doc) {
      throw new AppError("NOT_FOUND", "Mock task not found. It may have been cleared from local storage.");
    }
    return this.toTask(doc);
  }

  private toTask(doc: MockTaskDocument): VideoTask {
    const elapsed = Math.max(0, this.now() - doc.createdAt);
    const base = { providerTaskId: doc.id, isDemo: true };

    if (elapsed < doc.queueMs) {
      return { ...base, status: "queued", providerStatus: "queued", progress: 0 };
    }

    const runningFor = elapsed - doc.queueMs;
    if (runningFor < doc.runMs) {
      // Failures happen part-way through, like a real moderation/runtime failure.
      if (doc.outcome === "failure" && runningFor >= doc.runMs * 0.6) {
        return this.failed(doc);
      }
      const progress = Math.min(99, Math.round((runningFor / doc.runMs) * 100));
      return { ...base, status: "running", providerStatus: "running", progress };
    }

    if (doc.outcome === "failure") return this.failed(doc);

    return {
      ...base,
      status: "succeeded",
      providerStatus: "succeeded",
      progress: 100,
      videoUrl: demoVideoFor(doc.aspectRatio),
    };
  }

  private failed(doc: MockTaskDocument): VideoTask {
    return {
      providerTaskId: doc.id,
      isDemo: true,
      status: "failed",
      providerStatus: "failed",
      error: {
        code: "TASK_FAILED",
        providerCode: "MockSimulatedFailure",
        message: "Simulated failure (Mock Mode). No real generation was attempted.",
        retryable: true,
      },
    };
  }
}
