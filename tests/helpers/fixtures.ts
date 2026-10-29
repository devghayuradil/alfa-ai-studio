import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { StoredImage, VideoRequest } from "@/types/video";

/** Minimal PNG header (signature + IHDR) — enough for type sniffing and dimension parsing. */
export function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 2, 0, 0, 0], 24);
  return bytes;
}

export const sampleImage: StoredImage = {
  id: "11111111-1111-4111-8111-111111111111",
  mimeType: "image/png",
  sizeBytes: 33,
  width: 1280,
  height: 720,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export function videoRequest(overrides: Partial<VideoRequest> = {}): VideoRequest {
  return {
    mode: "text-to-video",
    prompt: "A cinematic drone shot over mountains",
    model: "seedance-1-5-pro-251215",
    duration: 5,
    aspectRatio: "16:9",
    resolution: "720p",
    watermark: false,
    generateAudio: false,
    cameraFixed: false,
    ...overrides,
  };
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "alfa-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
