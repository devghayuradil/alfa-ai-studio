import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { FileGenerationRepository } from "@/lib/db/file-repository";
import { AppError } from "@/lib/errors";
import { GenerationService } from "@/lib/services/generation-service";
import { JsonDocumentStore } from "@/lib/storage/json-store";
import type { CreateVideoInput } from "@/lib/validations/video";
import { type MockTaskDocument, MockVideoProvider } from "@/lib/video/mock-provider";
import type { VideoProvider } from "@/lib/video/provider";
import type { StoredImage } from "@/types/video";

import { sampleImage, withTempDir } from "./helpers/fixtures";

const MODEL = "seedance-1-5-pro-251215";

function input(overrides: Partial<CreateVideoInput> = {}): CreateVideoInput {
  return {
    clientRequestId: crypto.randomUUID(),
    mode: "text-to-video",
    prompt: "A paper boat drifting down a rainy street",
    model: MODEL,
    duration: 5,
    aspectRatio: "16:9",
    resolution: "720p",
    watermark: false,
    generateAudio: false,
    cameraFixed: false,
    ...overrides,
  };
}

function setup(dir: string, options: { provider?: VideoProvider; images?: StoredImage[] } = {}) {
  const clock = { now: Date.parse("2026-01-01T00:00:00Z") };
  const mock = new MockVideoProvider({
    store: new JsonDocumentStore<MockTaskDocument>(path.join(dir, "mock")),
    queueMs: 1_000,
    runMs: 2_000,
    now: () => clock.now,
  });
  const provider = options.provider ?? mock;
  const repository = new FileGenerationRepository(path.join(dir, "generations"));
  const images = new Map((options.images ?? []).map((image) => [image.id, image]));
  const onModelError = vi.fn(async () => undefined);
  const service = new GenerationService({
    repository,
    imageStorage: { get: async (id: string) => images.get(id) ?? null },
    provider: () => provider,
    providerForRecord: (name) => (name === provider.name ? provider : name === "mock" ? mock : null),
    allowedModels: () => [MODEL, "seedance-1-0-pro-fast-251015"],
    onModelError,
    now: () => new Date(clock.now),
  });
  return { service, repository, clock, onModelError };
}

describe("GenerationService", () => {
  it("creates a record and follows the mock task to completion", () =>
    withTempDir(async (dir) => {
      const { service, clock } = setup(dir);
      const { record, duplicate } = await service.create(input());
      expect(duplicate).toBe(false);
      expect(record).toMatchObject({ provider: "mock", status: "queued", isDemo: true });

      clock.now += 1_600;
      expect((await service.get(record.id)).status).toBe("running");

      clock.now += 5_000;
      const done = await service.get(record.id);
      expect(done.status).toBe("succeeded");
      expect(done.videoUrl).toMatch(/^\/demo\//);
      expect(done.completedAt).toBeDefined();
    }));

  it("keeps history and mock task state consistent across service instances", () =>
    withTempDir(async (dir) => {
      const first = setup(dir);
      const { record } = await first.service.create(input());
      const second = setup(dir);
      second.clock.now = first.clock.now + 60_000;
      expect((await second.service.get(record.id)).status).toBe("succeeded");
      const list = await second.service.list();
      expect(list.map((r) => r.id)).toEqual([record.id]);
      expect(list[0].status).toBe("succeeded");
    }));

  it("de-duplicates repeated submissions with the same clientRequestId", () =>
    withTempDir(async (dir) => {
      const inner = new MockVideoProvider({
        store: new JsonDocumentStore<MockTaskDocument>(path.join(dir, "mock")),
        queueMs: 1_000,
        runMs: 2_000,
      });
      const createTask = vi.spyOn(inner, "createTask");
      const { service } = setup(dir, { provider: inner });
      const request = input();
      const [a, b] = await Promise.all([service.create(request), service.create(request)]);
      const c = await service.create(request);
      expect(a.record.id).toBe(b.record.id);
      expect(c).toMatchObject({ duplicate: true, record: { id: a.record.id } });
      expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1);
      expect(createTask).toHaveBeenCalledTimes(1);
      expect(await service.list()).toHaveLength(1);
    }));

  it("rejects unsupported feature combinations before calling the provider", () =>
    withTempDir(async (dir) => {
      const provider: VideoProvider = { name: "mock", createTask: vi.fn(), getTask: vi.fn() };
      const { service } = setup(dir, { provider, images: [sampleImage] });
      await expect(
        service.create(
          input({
            mode: "image-to-video",
            model: "seedance-1-0-pro-fast-251015",
            firstFrameId: sampleImage.id,
            lastFrameId: "22222222-2222-4222-8222-222222222222",
          }),
        ),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_FEATURE" });
      await expect(service.create(input({ duration: 9 }))).rejects.toMatchObject({ code: "UNSUPPORTED_FEATURE" });
      expect(provider.createTask).not.toHaveBeenCalled();
    }));

  it("rejects models that are not enabled", () =>
    withTempDir(async (dir) => {
      const { service } = setup(dir);
      await expect(service.create(input({ model: "seedance-9-9-pro" }))).rejects.toMatchObject({
        code: "UNSUPPORTED_FEATURE",
      });
    }));

  it("rejects references to missing uploads", () =>
    withTempDir(async (dir) => {
      const { service } = setup(dir);
      await expect(
        service.create(input({ mode: "image-to-video", firstFrameId: sampleImage.id, aspectRatio: "adaptive" })),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }));

  it("records model access errors from real providers and persists nothing", () =>
    withTempDir(async (dir) => {
      const provider: VideoProvider = {
        name: "byteplus",
        createTask: vi.fn().mockRejectedValue(new AppError("MODEL_NOT_OPEN", "not open", { providerCode: "ModelNotOpen" })),
        getTask: vi.fn(),
      };
      const { service, onModelError } = setup(dir, { provider });
      await expect(service.create(input())).rejects.toMatchObject({ code: "MODEL_NOT_OPEN" });
      expect(onModelError).toHaveBeenCalledWith(MODEL, expect.objectContaining({ code: "MODEL_NOT_OPEN" }));
      expect(await service.list()).toHaveLength(0);
    }));

  it("ignores mockOutcome for real providers", () =>
    withTempDir(async (dir) => {
      const createTask = vi.fn().mockResolvedValue({ providerTaskId: "cgt-1", status: "queued", isDemo: false });
      const provider: VideoProvider = { name: "byteplus", createTask, getTask: vi.fn() };
      const { service } = setup(dir, { provider });
      await service.create(input({ mockOutcome: "failure" }));
      expect(createTask.mock.calls[0][0].mockOutcome).toBeUndefined();
    }));

  it("keeps tasks alive on transient refresh errors and surfaces a warning", () =>
    withTempDir(async (dir) => {
      const provider: VideoProvider = {
        name: "byteplus",
        createTask: vi.fn().mockResolvedValue({ providerTaskId: "cgt-1", status: "queued", isDemo: false }),
        getTask: vi.fn().mockRejectedValue(new AppError("PROVIDER_UNAVAILABLE", "down")),
      };
      const { service, clock } = setup(dir, { provider });
      const { record } = await service.create(input());
      clock.now += 5_000;
      const refreshed = await service.get(record.id);
      expect(refreshed.status).toBe("queued");
      expect(refreshed.refreshWarning).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: true });
    }));

  it("throttles provider status checks", () =>
    withTempDir(async (dir) => {
      const getTask = vi.fn().mockResolvedValue({ providerTaskId: "cgt-1", status: "running", isDemo: false });
      const provider: VideoProvider = {
        name: "byteplus",
        createTask: vi.fn().mockResolvedValue({ providerTaskId: "cgt-1", status: "queued", isDemo: false }),
        getTask,
      };
      const { service, clock } = setup(dir, { provider });
      const { record } = await service.create(input());
      await service.get(record.id);
      expect(getTask).not.toHaveBeenCalled();
      clock.now += 2_000;
      await service.get(record.id);
      await service.get(record.id);
      expect(getTask).toHaveBeenCalledTimes(1);
    }));

  it("does not refresh BytePlus records while in mock mode", () =>
    withTempDir(async (dir) => {
      const real = setup(dir, {
        provider: {
          name: "byteplus",
          createTask: vi.fn().mockResolvedValue({ providerTaskId: "cgt-1", status: "queued", isDemo: false }),
          getTask: vi.fn(),
        },
      });
      const { record } = await real.service.create(input());
      const mockMode = setup(dir);
      mockMode.clock.now = real.clock.now + 10_000;
      const result = await mockMode.service.get(record.id);
      expect(result.status).toBe("queued");
      expect(result.refreshWarning?.code).toBe("CONFIG_ERROR");
    }));

  it("deletes records and reports NOT_FOUND afterwards", () =>
    withTempDir(async (dir) => {
      const { service } = setup(dir);
      const { record } = await service.create(input());
      await service.delete(record.id);
      await expect(service.get(record.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(service.delete(record.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});
