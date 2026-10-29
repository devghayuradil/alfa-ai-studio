import { imageSize } from "image-size";

import { AppError } from "@/lib/errors";
import { IMAGE_CONSTRAINTS } from "@/lib/video/capabilities";
import type { StoredImage } from "@/types/video";

export type AllowedMime = StoredImage["mimeType"];

/**
 * Detect the real image type from magic bytes. The browser-provided
 * Content-Type and file extension are never trusted.
 */
export function sniffImageMime(bytes: Uint8Array): AllowedMime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export interface ValidatedImage {
  mimeType: AllowedMime;
  width: number;
  height: number;
  sizeBytes: number;
}

/** Validate type, size and dimensions of an uploaded reference image. */
export function validateImageBytes(bytes: Uint8Array): ValidatedImage {
  if (bytes.byteLength === 0) {
    throw new AppError("VALIDATION_ERROR", "The uploaded file is empty.");
  }
  if (bytes.byteLength > IMAGE_CONSTRAINTS.maxBytes) {
    throw new AppError(
      "PAYLOAD_TOO_LARGE",
      `Images must be ${IMAGE_CONSTRAINTS.maxBytes / 1024 / 1024} MB or smaller.`,
    );
  }

  const mimeType = sniffImageMime(bytes);
  if (!mimeType) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Only PNG, JPEG and WebP images are supported.");
  }

  let width: number | undefined;
  let height: number | undefined;
  try {
    const size = imageSize(bytes);
    width = size.width;
    height = size.height;
    // JPEG EXIF orientations 5–8 swap the displayed axes.
    if (size.orientation && size.orientation >= 5 && width && height) {
      [width, height] = [height, width];
    }
  } catch {
    // handled below
  }
  if (!width || !height) {
    throw new AppError("VALIDATION_ERROR", "Could not read the image dimensions. The file may be corrupted.");
  }

  const { minSide, maxSide, minAspect, maxAspect } = IMAGE_CONSTRAINTS;
  if (Math.min(width, height) < minSide) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Image is ${width}×${height}px. Each side must be at least ${minSide}px.`,
    );
  }
  if (Math.max(width, height) > maxSide) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Image is ${width}×${height}px. Each side must be at most ${maxSide}px.`,
    );
  }
  const aspect = width / height;
  if (aspect < minAspect || aspect > maxAspect) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Image aspect ratio ${aspect.toFixed(2)} is outside the supported range (${minAspect}–${maxAspect}).`,
    );
  }

  return { mimeType, width, height, sizeBytes: bytes.byteLength };
}
