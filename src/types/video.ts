/**
 * Shared domain types used by both the server (providers, repositories, routes)
 * and the client (forms, polling, history). Keep this file free of runtime
 * dependencies so it can be imported anywhere.
 */

export const PROVIDER_NAMES = ["mock", "byteplus"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const GENERATION_MODES = ["text-to-video", "image-to-video"] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

export const TASK_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TERMINAL_STATUSES: readonly TaskStatus[] = ["succeeded", "failed", "cancelled"];

export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** "adaptive" lets the model follow the reference image's aspect ratio (image-to-video only). */
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "adaptive"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const IMAGE_ROLES = ["first_frame", "last_frame"] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];

export const MOCK_OUTCOMES = ["success", "failure"] as const;
export type MockOutcome = (typeof MOCK_OUTCOMES)[number];

export interface TaskError {
  code: string;
  message: string;
  /** Original provider error code, e.g. "ModelNotOpen". */
  providerCode?: string;
  retryable?: boolean;
}

/** A reference image that has passed validation and lives in image storage. */
export interface StoredImage {
  id: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  createdAt: string;
}

/** A fully validated, capability-checked request handed to a provider. */
export interface VideoRequest {
  mode: GenerationMode;
  prompt: string;
  model: string;
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  watermark: boolean;
  generateAudio: boolean;
  cameraFixed: boolean;
  seed?: number;
  firstFrame?: StoredImage;
  lastFrame?: StoredImage;
  /** Only honoured by the mock provider. */
  mockOutcome?: MockOutcome;
}

/** Provider-neutral view of a generation task. */
export interface VideoTask {
  providerTaskId: string;
  status: TaskStatus;
  /** Raw status string reported by the provider, kept for debugging. */
  providerStatus?: string;
  videoUrl?: string;
  /** True when the video is a bundled demo asset rather than AI output. */
  isDemo: boolean;
  /** 0–100 estimate. Only the mock provider can report real progress. */
  progress?: number;
  error?: TaskError;
}

/** A persisted generation as stored in history. */
export interface GenerationRecord {
  id: string;
  clientRequestId: string;
  provider: ProviderName;
  providerTaskId: string;
  mode: GenerationMode;
  prompt: string;
  model: string;
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  watermark: boolean;
  generateAudio: boolean;
  cameraFixed: boolean;
  seed?: number;
  firstFrameId?: string;
  lastFrameId?: string;
  status: TaskStatus;
  providerStatus?: string;
  progress?: number;
  videoUrl?: string;
  isDemo: boolean;
  error?: TaskError;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  lastCheckedAt?: string;
}

/** Shape returned to the browser for a single generation. */
export interface GenerationDTO extends GenerationRecord {
  /** Non-fatal problem while refreshing status (e.g. provider temporarily unreachable). */
  refreshWarning?: TaskError;
}
