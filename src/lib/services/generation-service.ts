import "server-only";

import { randomUUID } from "node:crypto";

import { getGenerationRepository } from "@/lib/db";
import type { GenerationRepository } from "@/lib/db/repository";
import { getEnv } from "@/lib/env";
import { AppError, isAppError, toAppError } from "@/lib/errors";
import { getImageStorage, type ImageStorage } from "@/lib/storage/image-storage";
import { checkCapabilities, type CreateVideoInput } from "@/lib/validations/video";
import { buildModelOptions, getCapabilities } from "@/lib/video/capabilities";
import { getProvider, getProviderForRecord } from "@/lib/video/factory";
import { recordModelError, recordModelSuccess } from "@/lib/video/model-status";
import type { VideoProvider } from "@/lib/video/provider";
import {
  type GenerationDTO,
  type GenerationRecord,
  isTerminalStatus,
  type ProviderName,
  type StoredImage,
  type TaskError,
  type VideoRequest,
  type VideoTask,
} from "@/types/video";

/** Avoid hitting the provider more than once per interval per task, however many tabs poll. */
const MIN_REFRESH_INTERVAL_MS = 1_500;
/** History list refreshes at most this many in-flight tasks per request. */
const LIST_REFRESH_LIMIT = 10;

export interface GenerationServiceDeps {
  repository: GenerationRepository;
  imageStorage: Pick<ImageStorage, "get">;
  provider: () => VideoProvider;
  providerForRecord: (name: ProviderName) => VideoProvider | null;
  allowedModels: () => string[];
  onModelSuccess?: (model: string) => Promise<void>;
  onModelError?: (model: string, error: AppError) => Promise<void>;
  now?: () => Date;
}

export class GenerationService {
  private readonly inFlight = new Map<string, Promise<{ record: GenerationRecord; duplicate: boolean }>>();
  private readonly now: () => Date;

  constructor(private readonly deps: GenerationServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Create a generation. Submitting the same clientRequestId twice (double
   * click, retry after a dropped response) returns the original record instead
   * of starting — and paying for — a second task.
   */
  async create(input: CreateVideoInput): Promise<{ record: GenerationRecord; duplicate: boolean }> {
    const pending = this.inFlight.get(input.clientRequestId);
    if (pending) {
      const result = await pending;
      return { record: result.record, duplicate: true };
    }
    const promise = this.createOnce(input);
    this.inFlight.set(input.clientRequestId, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(input.clientRequestId);
    }
  }

  private async createOnce(input: CreateVideoInput) {
    const existing = await this.deps.repository.findByClientRequestId(input.clientRequestId);
    if (existing) return { record: existing, duplicate: true };

    if (!this.deps.allowedModels().includes(input.model)) {
      throw new AppError("UNSUPPORTED_FEATURE", "This model is not enabled. Add it to ARK_MODEL or ARK_EXTRA_MODELS.", {
        issues: [{ field: "model", message: "Model is not enabled on this server." }],
      });
    }

    const capabilities = getCapabilities(input.model);
    const issues = checkCapabilities(input, capabilities);
    if (issues.length > 0) {
      throw new AppError("UNSUPPORTED_FEATURE", issues[0].message, { issues });
    }

    const [firstFrame, lastFrame] = await Promise.all([
      this.loadImage(input.firstFrameId, "first-frame"),
      this.loadImage(input.lastFrameId, "last-frame"),
    ]);

    const provider = this.deps.provider();
    const request: VideoRequest = {
      mode: input.mode,
      prompt: input.prompt,
      model: input.model,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      watermark: input.watermark,
      generateAudio: input.generateAudio,
      cameraFixed: input.cameraFixed,
      seed: input.seed,
      firstFrame,
      lastFrame,
      mockOutcome: provider.name === "mock" ? input.mockOutcome : undefined,
    };

    let task: VideoTask;
    try {
      task = await provider.createTask(request);
    } catch (error) {
      const appError = toAppError(error);
      if (provider.name !== "mock") await this.deps.onModelError?.(input.model, appError);
      throw appError;
    }

    const timestamp = this.now().toISOString();
    const record: GenerationRecord = {
      id: randomUUID(),
      clientRequestId: input.clientRequestId,
      provider: provider.name,
      providerTaskId: task.providerTaskId,
      mode: input.mode,
      prompt: input.prompt,
      model: input.model,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      watermark: input.watermark,
      generateAudio: input.generateAudio,
      cameraFixed: input.cameraFixed,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(firstFrame ? { firstFrameId: firstFrame.id } : {}),
      ...(lastFrame ? { lastFrameId: lastFrame.id } : {}),
      status: task.status,
      providerStatus: task.providerStatus,
      progress: task.progress,
      isDemo: task.isDemo,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastCheckedAt: timestamp,
    };
    await this.deps.repository.create(record);
    return { record, duplicate: false };
  }

  private async loadImage(id: string | undefined, label: string): Promise<StoredImage | undefined> {
    if (!id) return undefined;
    const image = await this.deps.imageStorage.get(id);
    if (!image) {
      throw new AppError("VALIDATION_ERROR", `The ${label} image is no longer available. Please upload it again.`, {
        issues: [{ field: label === "first-frame" ? "firstFrameId" : "lastFrameId", message: "Image not found." }],
      });
    }
    return image;
  }

  /** Fetch a generation, refreshing its status from the provider if it is still in flight. */
  async get(id: string): Promise<GenerationDTO> {
    const record = await this.deps.repository.findById(id);
    if (!record) throw new AppError("NOT_FOUND", "Generation not found.");
    return this.refresh(record);
  }

  async list(limit?: number): Promise<GenerationDTO[]> {
    const records = await this.deps.repository.list({ limit });
    let budget = LIST_REFRESH_LIMIT;
    return Promise.all(
      records.map((record) => {
        if (isTerminalStatus(record.status) || budget <= 0) return record;
        budget -= 1;
        return this.refresh(record).catch(() => record);
      }),
    );
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.deps.repository.delete(id);
    if (!deleted) throw new AppError("NOT_FOUND", "Generation not found.");
  }

  private async refresh(record: GenerationRecord): Promise<GenerationDTO> {
    if (isTerminalStatus(record.status)) return record;

    const lastChecked = record.lastCheckedAt ? Date.parse(record.lastCheckedAt) : 0;
    if (this.now().getTime() - lastChecked < MIN_REFRESH_INTERVAL_MS) return record;

    const provider = this.deps.providerForRecord(record.provider);
    if (!provider) {
      return {
        ...record,
        refreshWarning: {
          code: "CONFIG_ERROR",
          message: `Created with ${record.provider}. Switch VIDEO_PROVIDER to ${record.provider} to refresh its status.`,
        },
      };
    }

    const checkedAt = this.now().toISOString();
    let task: VideoTask;
    try {
      task = await provider.getTask(record.providerTaskId);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code === "NOT_FOUND") {
        const failed = await this.deps.repository.update(record.id, {
          status: "failed",
          error: { code: "NOT_FOUND", message: appError.message, retryable: true },
          completedAt: checkedAt,
          lastCheckedAt: checkedAt,
        });
        return failed ?? record;
      }
      // Transient or configuration problem: keep the task alive and tell the client.
      await this.deps.repository.update(record.id, { lastCheckedAt: checkedAt }).catch(() => null);
      const warning: TaskError = {
        code: appError.code,
        message: appError.message,
        providerCode: appError.providerCode,
        retryable: isAppError(error) ? appError.retryable : true,
      };
      return { ...record, lastCheckedAt: checkedAt, refreshWarning: warning };
    }

    const patch: Partial<GenerationRecord> = {
      status: task.status,
      providerStatus: task.providerStatus,
      progress: task.progress,
      isDemo: task.isDemo,
      lastCheckedAt: checkedAt,
    };
    if (task.videoUrl) patch.videoUrl = task.videoUrl;
    if (task.error) patch.error = task.error;
    if (isTerminalStatus(task.status)) patch.completedAt = checkedAt;

    const updated = await this.deps.repository.update(record.id, patch);
    if (task.status === "succeeded" && provider.name !== "mock") {
      await this.deps.onModelSuccess?.(record.model);
    }
    return updated ?? { ...record, ...patch };
  }
}

let service: GenerationService | undefined;

export function getGenerationService(): GenerationService {
  service ??= new GenerationService({
    repository: getGenerationRepository(),
    imageStorage: getImageStorage(),
    provider: getProvider,
    providerForRecord: getProviderForRecord,
    allowedModels: () => {
      const env = getEnv();
      return buildModelOptions(env.arkModel, env.arkExtraModels).map((option) => option.id);
    },
    onModelSuccess: recordModelSuccess,
    onModelError: (model, error) => recordModelError(model, error.code, error.providerCode),
  });
  return service;
}
