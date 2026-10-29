import path from "node:path";

import { describe, expect, it } from "vitest";

import { FileGenerationRepository } from "@/lib/db/file-repository";
import { LocalImageStorage } from "@/lib/storage/image-storage";
import { JsonDocumentStore } from "@/lib/storage/json-store";
import { sniffImageMime, validateImageBytes } from "@/lib/uploads/image-validation";
import type { GenerationRecord } from "@/types/video";

import { pngBytes, withTempDir } from "./helpers/fixtures";

describe("image validation", () => {
  it("sniffs PNG, JPEG and WebP from magic bytes", () => {
    expect(sniffImageMime(pngBytes(400, 400))).toBe("image/png");
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageMime(webp)).toBe("image/webp");
    expect(sniffImageMime(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(sniffImageMime(new TextEncoder().encode("<svg xmlns="))).toBeNull();
  });

  it("accepts a valid image and reports its dimensions", () => {
    expect(validateImageBytes(pngBytes(1280, 720))).toMatchObject({ mimeType: "image/png", width: 1280, height: 720 });
  });

  it.each([
    ["too small", pngBytes(200, 720), "VALIDATION_ERROR"],
    ["too large", pngBytes(7000, 3000), "VALIDATION_ERROR"],
    ["extreme aspect ratio", pngBytes(3000, 400), "VALIDATION_ERROR"],
    ["empty", new Uint8Array(), "VALIDATION_ERROR"],
    ["not an image", new TextEncoder().encode("hello world, definitely not a png"), "UNSUPPORTED_MEDIA_TYPE"],
    ["over 10 MB", new Uint8Array(10 * 1024 * 1024 + 1), "PAYLOAD_TOO_LARGE"],
  ])("rejects %s", (_label, bytes, code) => {
    expect(() => validateImageBytes(bytes)).toThrow(expect.objectContaining({ code }));
  });
});

describe("LocalImageStorage", () => {
  it("stores bytes on disk and returns metadata by opaque id", () =>
    withTempDir(async (dir) => {
      const storage = new LocalImageStorage(dir);
      const saved = await storage.save(pngBytes(800, 600));
      expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
      const read = await storage.read(saved.id);
      expect(read?.image).toEqual(saved);
      expect(new Uint8Array(read!.bytes)).toEqual(pngBytes(800, 600));
    }));

  it("refuses ids that are not UUIDs (no path traversal)", () =>
    withTempDir(async (dir) => {
      const storage = new LocalImageStorage(dir);
      expect(await storage.get("../../etc/passwd")).toBeNull();
      expect(await storage.read("..%2F..%2Fsecret")).toBeNull();
    }));
});

describe("JsonDocumentStore / FileGenerationRepository", () => {
  it("round-trips documents atomically and lists them", () =>
    withTempDir(async (dir) => {
      const store = new JsonDocumentStore<{ id: string; value: number }>(dir);
      await store.put({ id: "a", value: 1 });
      await store.put({ id: "a", value: 2 });
      await store.put({ id: "b", value: 3 });
      expect(await store.get("a")).toEqual({ id: "a", value: 2 });
      expect((await store.list()).map((d) => d.id).sort()).toEqual(["a", "b"]);
      expect(await store.get("../a")).toBeNull();
    }));

  it("lists history newest first and finds by clientRequestId", () =>
    withTempDir(async (dir) => {
      const repo = new FileGenerationRepository(path.join(dir, "gen"));
      const make = (id: string, createdAt: string): GenerationRecord => ({
        id,
        clientRequestId: `req-${id}`,
        provider: "mock",
        providerTaskId: `mock-${id}`,
        mode: "text-to-video",
        prompt: "p",
        model: "m",
        duration: 5,
        aspectRatio: "16:9",
        resolution: "720p",
        watermark: false,
        generateAudio: false,
        cameraFixed: false,
        status: "queued",
        isDemo: true,
        createdAt,
        updatedAt: createdAt,
      });
      await repo.create(make("old", "2026-01-01T00:00:00.000Z"));
      await repo.create(make("new", "2026-02-01T00:00:00.000Z"));
      expect((await repo.list()).map((r) => r.id)).toEqual(["new", "old"]);
      expect((await repo.findByClientRequestId("req-old"))?.id).toBe("old");
      const updated = await repo.update("old", { status: "succeeded" });
      expect(updated?.status).toBe("succeeded");
      expect(await repo.update("missing", { status: "failed" })).toBeNull();
    }));
});
