import { z } from "zod";

import type { FieldIssue } from "@/lib/errors";
import {
  aspectRatiosFor,
  type ModelCapabilities,
  PROMPT_MAX_LENGTH,
} from "@/lib/video/capabilities";
import { ASPECT_RATIOS, GENERATION_MODES, MOCK_OUTCOMES, RESOLUTIONS } from "@/types/video";

export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const uploadId = z.string().regex(UUID_V4_PATTERN, "Invalid image reference");

/** Body accepted by POST /api/videos. */
export const createVideoSchema = z.object({
  clientRequestId: z.uuid({ error: "Missing request ID" }),
  mode: z.enum(GENERATION_MODES),
  prompt: z
    .string()
    .trim()
    .min(3, "Describe your video in at least 3 characters")
    .max(PROMPT_MAX_LENGTH, `Prompt must be ${PROMPT_MAX_LENGTH} characters or fewer`),
  model: z.string().trim().min(1, "Choose a model").max(128),
  duration: z.number().int().positive(),
  aspectRatio: z.enum(ASPECT_RATIOS),
  resolution: z.enum(RESOLUTIONS),
  watermark: z.boolean().default(false),
  generateAudio: z.boolean().default(false),
  cameraFixed: z.boolean().default(false),
  seed: z.number().int().min(-1).max(4_294_967_295).optional(),
  firstFrameId: uploadId.optional(),
  lastFrameId: uploadId.optional(),
  mockOutcome: z.enum(MOCK_OUTCOMES).optional(),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;

/**
 * Cross-check a structurally valid request against what the selected model
 * actually supports. Returns every problem so the UI can show them together.
 */
export function checkCapabilities(
  input: Pick<
    CreateVideoInput,
    | "mode"
    | "duration"
    | "aspectRatio"
    | "resolution"
    | "watermark"
    | "generateAudio"
    | "cameraFixed"
    | "seed"
    | "firstFrameId"
    | "lastFrameId"
  >,
  capabilities: ModelCapabilities,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const name = capabilities.label;

  if (input.mode === "text-to-video") {
    if (!capabilities.textToVideo) {
      issues.push({ field: "mode", message: `${name} does not support text-to-video. Add a first-frame image.` });
    }
    if (input.firstFrameId || input.lastFrameId) {
      issues.push({
        field: "mode",
        message: "Reference images are only used in Image to Video mode.",
      });
    }
  } else {
    if (!capabilities.imageToVideo.firstFrame) {
      issues.push({ field: "mode", message: `${name} does not accept image input.` });
    }
    if (!input.firstFrameId) {
      issues.push({ field: "firstFrameId", message: "Upload a first-frame image." });
    }
    if (input.lastFrameId && !capabilities.imageToVideo.lastFrame) {
      issues.push({ field: "lastFrameId", message: `${name} does not support a last-frame image.` });
    }
    if (input.lastFrameId && input.lastFrameId === input.firstFrameId) {
      issues.push({ field: "lastFrameId", message: "First and last frame must be different uploads." });
    }
  }

  if (!capabilities.durations.includes(input.duration)) {
    issues.push({
      field: "duration",
      message: `${name} supports ${capabilities.durations.join(", ")}s durations.`,
    });
  }

  const ratios = aspectRatiosFor(capabilities, input.mode);
  if (ratios.length > 0 && !ratios.includes(input.aspectRatio)) {
    issues.push({
      field: "aspectRatio",
      message:
        input.aspectRatio === "adaptive"
          ? "Adaptive aspect ratio is only available for image-to-video."
          : `${name} does not support ${input.aspectRatio} here.`,
    });
  }

  if (!capabilities.resolutions.includes(input.resolution)) {
    issues.push({
      field: "resolution",
      message: `${name} supports ${capabilities.resolutions.join(", ")}.`,
    });
  }

  if (input.watermark && !capabilities.watermark) {
    issues.push({ field: "watermark", message: `${name} does not support watermark control.` });
  }
  if (input.generateAudio && !capabilities.audio) {
    issues.push({ field: "generateAudio", message: `${name} cannot generate audio.` });
  }
  if (input.cameraFixed && !capabilities.cameraFixed) {
    issues.push({ field: "cameraFixed", message: `${name} does not support a fixed camera.` });
  }
  if (input.seed !== undefined && !capabilities.seed) {
    issues.push({ field: "seed", message: `${name} does not support a custom seed.` });
  }

  return issues;
}

export function zodIssuesToFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));
}
