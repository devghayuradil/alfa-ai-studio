/**
 * Request/response shapes for BytePlus ModelArk content generation tasks.
 *
 * Field names follow the official ModelArk API (mirrored by BytePlus's own
 * `byteplussdkarkruntime` SDK, `content_generation.tasks`):
 *   POST /contents/generations/tasks       → { id }
 *   GET  /contents/generations/tasks/{id}  → task object
 *
 * Only parameters the selected model supports are ever included.
 */

import { getCapabilities } from "@/lib/video/capabilities";
import type { ImageRole, StoredImage, TaskStatus, VideoRequest } from "@/types/video";

export interface ArkTextContent {
  type: "text";
  text: string;
}

export interface ArkImageContent {
  type: "image_url";
  image_url: { url: string };
  role: ImageRole;
}

export type ArkContent = ArkTextContent | ArkImageContent;

export interface ArkCreateTaskBody {
  model: string;
  content: ArkContent[];
  ratio?: string;
  duration?: number;
  resolution?: string;
  watermark?: boolean;
  seed?: number;
  camera_fixed?: boolean;
  generate_audio?: boolean;
}

export interface ArkCreateTaskResponse {
  id: string;
}

export interface ArkTaskResponse {
  id: string;
  model?: string;
  status?: string;
  error?: { code?: string; message?: string } | null;
  content?: { video_url?: string; last_frame_url?: string } | null;
  created_at?: number;
  updated_at?: number;
}

export interface ImageWithBytes {
  image: StoredImage;
  bytes: Uint8Array;
}

/** ModelArk accepts images as public URLs or base64 data URIs. We only use data URIs (no SSRF surface). */
export function toDataUri(image: ImageWithBytes): string {
  const format = image.image.mimeType.replace("image/", "");
  return `data:image/${format};base64,${Buffer.from(image.bytes).toString("base64")}`;
}

export function buildCreateTaskBody(
  request: VideoRequest,
  images: { firstFrame?: ImageWithBytes; lastFrame?: ImageWithBytes } = {},
): ArkCreateTaskBody {
  const capabilities = getCapabilities(request.model);
  const content: ArkContent[] = [{ type: "text", text: request.prompt }];

  if (request.mode === "image-to-video") {
    if (!images.firstFrame) {
      throw new Error("Image-to-video requires a first-frame image");
    }
    content.push({ type: "image_url", image_url: { url: toDataUri(images.firstFrame) }, role: "first_frame" });
    if (images.lastFrame && capabilities.imageToVideo.lastFrame) {
      content.push({ type: "image_url", image_url: { url: toDataUri(images.lastFrame) }, role: "last_frame" });
    }
  }

  const body: ArkCreateTaskBody = {
    model: request.model,
    content,
    ratio: request.aspectRatio,
    duration: request.duration,
    resolution: request.resolution,
  };

  if (capabilities.watermark) body.watermark = request.watermark;
  // Sent explicitly (true or false) because audio-capable models may default to generating audio.
  if (capabilities.audio) body.generate_audio = request.generateAudio;
  if (capabilities.cameraFixed && request.cameraFixed) body.camera_fixed = true;
  if (capabilities.seed && request.seed !== undefined) body.seed = request.seed;

  return body;
}

/** Map ModelArk task statuses onto ours. Unknown in-flight statuses are treated as running. */
export function normalizeArkStatus(status: string | undefined): TaskStatus {
  switch ((status ?? "").toLowerCase()) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
    case "expired":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "running";
  }
}

/** Remove image payloads so request bodies can be logged safely. */
export function redactBody(body: ArkCreateTaskBody): ArkCreateTaskBody {
  return {
    ...body,
    content: body.content.map((item) =>
      item.type === "image_url" ? { ...item, image_url: { url: "data:<redacted>" } } : item,
    ),
  };
}
