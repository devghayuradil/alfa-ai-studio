/**
 * Model capability registry.
 *
 * Seedance models differ in what they accept (text-only vs image input, last
 * frame support, audio, durations, resolutions). The UI only offers controls a
 * model supports, and the server re-validates every request against the same
 * table before anything is sent to a provider.
 *
 * Model IDs themselves are never hard-coded as "available": the list of
 * selectable models comes from ARK_MODEL / ARK_EXTRA_MODELS. A model ID is
 * matched to a capability profile by its family prefix. Unknown IDs (for
 * example a custom endpoint ID "ep-...") fall back to a deliberately
 * conservative profile.
 *
 * Values reflect BytePlus ModelArk documentation at the time of writing.
 * Re-check them against the ModelArk console/docs when enabling a new model,
 * and adjust the profile here — this is the single source of truth.
 */

import type { AspectRatio, GenerationMode, Resolution } from "@/types/video";

export interface ModelCapabilities {
  /** Stable profile key. */
  family: string;
  label: string;
  description: string;
  textToVideo: boolean;
  imageToVideo: {
    firstFrame: boolean;
    lastFrame: boolean;
  };
  /** Allowed `duration` values in seconds. */
  durations: number[];
  defaultDuration: number;
  /** Ratios offered for text-to-video. */
  textAspectRatios: AspectRatio[];
  /** Ratios offered for image-to-video ("adaptive" follows the first frame). */
  imageAspectRatios: AspectRatio[];
  resolutions: Resolution[];
  defaultResolution: Resolution;
  watermark: boolean;
  /** `generate_audio` — synchronized audio track. */
  audio: boolean;
  /** `camera_fixed` — lock the camera. */
  cameraFixed: boolean;
  /** `seed` — reproducible sampling. */
  seed: boolean;
  /** False for the fallback profile used for unrecognised model IDs. */
  recognized: boolean;
}

interface CapabilityProfile extends ModelCapabilities {
  /** Model IDs starting with this prefix use the profile (longest prefix wins). */
  prefix: string;
}

const STANDARD_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1"];
const IMAGE_RATIOS: AspectRatio[] = ["adaptive", "16:9", "9:16", "1:1"];

const PROFILES: CapabilityProfile[] = [
  {
    prefix: "seedance-1-5-pro",
    family: "seedance-1.5-pro",
    label: "Seedance 1.5 Pro",
    description: "Flagship model with first/last-frame control and optional synchronized audio.",
    textToVideo: true,
    imageToVideo: { firstFrame: true, lastFrame: true },
    durations: [4, 5, 6, 8, 10, 12],
    defaultDuration: 5,
    textAspectRatios: STANDARD_RATIOS,
    imageAspectRatios: IMAGE_RATIOS,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    watermark: true,
    audio: true,
    cameraFixed: true,
    seed: true,
    recognized: true,
  },
  {
    prefix: "seedance-1-0-pro-fast",
    family: "seedance-1.0-pro-fast",
    label: "Seedance 1.0 Pro Fast",
    description: "Faster, lower-cost Pro variant. First-frame image input only.",
    textToVideo: true,
    imageToVideo: { firstFrame: true, lastFrame: false },
    durations: [5, 10],
    defaultDuration: 5,
    textAspectRatios: STANDARD_RATIOS,
    imageAspectRatios: IMAGE_RATIOS,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    watermark: true,
    audio: false,
    cameraFixed: true,
    seed: true,
    recognized: true,
  },
  {
    prefix: "seedance-1-0-pro",
    family: "seedance-1.0-pro",
    label: "Seedance 1.0 Pro",
    description: "High-quality text- and image-to-video with first/last-frame control.",
    textToVideo: true,
    imageToVideo: { firstFrame: true, lastFrame: true },
    durations: [5, 10],
    defaultDuration: 5,
    textAspectRatios: STANDARD_RATIOS,
    imageAspectRatios: IMAGE_RATIOS,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    watermark: true,
    audio: false,
    cameraFixed: true,
    seed: true,
    recognized: true,
  },
  {
    prefix: "seedance-1-0-lite-t2v",
    family: "seedance-1.0-lite-t2v",
    label: "Seedance 1.0 Lite (Text)",
    description: "Lightweight text-to-video model. Does not accept images.",
    textToVideo: true,
    imageToVideo: { firstFrame: false, lastFrame: false },
    durations: [5, 10],
    defaultDuration: 5,
    textAspectRatios: STANDARD_RATIOS,
    imageAspectRatios: [],
    resolutions: ["480p", "720p"],
    defaultResolution: "720p",
    watermark: true,
    audio: false,
    cameraFixed: true,
    seed: true,
    recognized: true,
  },
  {
    prefix: "seedance-1-0-lite-i2v",
    family: "seedance-1.0-lite-i2v",
    label: "Seedance 1.0 Lite (Image)",
    description: "Lightweight image-to-video model. Requires a first-frame image.",
    textToVideo: false,
    imageToVideo: { firstFrame: true, lastFrame: true },
    durations: [5, 10],
    defaultDuration: 5,
    textAspectRatios: [],
    imageAspectRatios: IMAGE_RATIOS,
    resolutions: ["480p", "720p"],
    defaultResolution: "720p",
    watermark: true,
    audio: false,
    cameraFixed: true,
    seed: true,
    recognized: true,
  },
];

/** Used for IDs we cannot match (custom endpoints, future models). */
export const FALLBACK_CAPABILITIES: ModelCapabilities = {
  family: "unknown",
  label: "Custom model",
  description:
    "Unrecognized model ID — using a conservative feature set. Add a profile in capabilities.ts to unlock more options.",
  textToVideo: true,
  imageToVideo: { firstFrame: true, lastFrame: false },
  durations: [5],
  defaultDuration: 5,
  textAspectRatios: STANDARD_RATIOS,
  imageAspectRatios: STANDARD_RATIOS,
  resolutions: ["720p"],
  defaultResolution: "720p",
  watermark: true,
  audio: false,
  cameraFixed: false,
  seed: false,
  recognized: false,
};

/** Strip a vendor prefix some consoles show (e.g. "doubao-") before matching. */
function normalizeModelId(modelId: string): string {
  return modelId.toLowerCase().replace(/^doubao-/, "");
}

export function getCapabilities(modelId: string): ModelCapabilities {
  const normalized = normalizeModelId(modelId);
  const match = PROFILES.filter((profile) => normalized.startsWith(profile.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  if (!match) return FALLBACK_CAPABILITIES;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { prefix, ...capabilities } = match;
  return capabilities;
}

export function supportsMode(capabilities: ModelCapabilities, mode: GenerationMode): boolean {
  return mode === "text-to-video" ? capabilities.textToVideo : capabilities.imageToVideo.firstFrame;
}

export function aspectRatiosFor(capabilities: ModelCapabilities, mode: GenerationMode): AspectRatio[] {
  return mode === "text-to-video" ? capabilities.textAspectRatios : capabilities.imageAspectRatios;
}

export interface ModelOption {
  id: string;
  isDefault: boolean;
  capabilities: ModelCapabilities;
}

export function buildModelOptions(defaultModel: string, extraModels: string[]): ModelOption[] {
  const ids = [defaultModel, ...extraModels.filter((id) => id !== defaultModel)];
  return ids.map((id) => ({ id, isDefault: id === defaultModel, capabilities: getCapabilities(id) }));
}

/** Reference image constraints (BytePlus ModelArk image input requirements). */
export const IMAGE_CONSTRAINTS = {
  mimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
  maxBytes: 10 * 1024 * 1024,
  minSide: 300,
  maxSide: 6000,
  /** width / height */
  minAspect: 0.4,
  maxAspect: 2.5,
} as const;

export const PROMPT_MAX_LENGTH = 2000;
