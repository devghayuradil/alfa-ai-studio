import { describe, expect, it } from "vitest";

import { checkCapabilities, createVideoSchema, type CreateVideoInput } from "@/lib/validations/video";
import { FALLBACK_CAPABILITIES, buildModelOptions, getCapabilities } from "@/lib/video/capabilities";

const base = {
  clientRequestId: "2b0c3c8e-6f7a-4e1b-9b55-2f1c0a9d3e4f",
  mode: "text-to-video",
  prompt: "  A fox running through snow  ",
  model: "seedance-1-5-pro-251215",
  duration: 5,
  aspectRatio: "16:9",
  resolution: "720p",
};

function input(overrides: Partial<CreateVideoInput> = {}): CreateVideoInput {
  return createVideoSchema.parse({ ...base, ...overrides });
}

describe("createVideoSchema", () => {
  it("accepts a valid request, trims the prompt and applies defaults", () => {
    const parsed = createVideoSchema.parse(base);
    expect(parsed.prompt).toBe("A fox running through snow");
    expect(parsed.watermark).toBe(false);
    expect(parsed.generateAudio).toBe(false);
    expect(parsed.cameraFixed).toBe(false);
  });

  it.each([
    ["empty prompt", { prompt: "  " }],
    ["prompt too long", { prompt: "x".repeat(2001) }],
    ["unknown mode", { mode: "video-to-video" }],
    ["unknown aspect ratio", { aspectRatio: "4:5" }],
    ["unknown resolution", { resolution: "4k" }],
    ["fractional duration", { duration: 5.5 }],
    ["string duration", { duration: "5" }],
    ["missing request id", { clientRequestId: undefined }],
    ["non-uuid image id (path traversal attempt)", { firstFrameId: "../../etc/passwd" }],
    ["external image url", { firstFrameId: "https://example.com/a.png" }],
    ["seed out of range", { seed: 2 ** 33 }],
  ])("rejects %s", (_label, overrides) => {
    expect(createVideoSchema.safeParse({ ...base, ...overrides }).success).toBe(false);
  });
});

describe("capability resolution", () => {
  it("matches model families by prefix, longest prefix first", () => {
    expect(getCapabilities("seedance-1-5-pro-251215").family).toBe("seedance-1.5-pro");
    expect(getCapabilities("seedance-1-0-pro-fast-251015").family).toBe("seedance-1.0-pro-fast");
    expect(getCapabilities("seedance-1-0-pro-250528").family).toBe("seedance-1.0-pro");
    expect(getCapabilities("seedance-1-0-lite-i2v-250428").textToVideo).toBe(false);
  });

  it("falls back to a conservative profile for unknown IDs", () => {
    const caps = getCapabilities("ep-20260101-custom");
    expect(caps).toEqual(FALLBACK_CAPABILITIES);
    expect(caps.recognized).toBe(false);
    expect(caps.imageToVideo.lastFrame).toBe(false);
    expect(caps.audio).toBe(false);
  });

  it("builds model options with the default first and no duplicates", () => {
    const options = buildModelOptions("seedance-1-5-pro-251215", ["seedance-1-0-pro-250528", "seedance-1-5-pro-251215"]);
    expect(options.map((o) => o.id)).toEqual(["seedance-1-5-pro-251215", "seedance-1-0-pro-250528"]);
    expect(options[0].isDefault).toBe(true);
  });
});

describe("checkCapabilities (unsupported feature combinations)", () => {
  const pro15 = getCapabilities("seedance-1-5-pro-251215");
  const fast = getCapabilities("seedance-1-0-pro-fast-251015");
  const liteT2v = getCapabilities("seedance-1-0-lite-t2v-250428");
  const liteI2v = getCapabilities("seedance-1-0-lite-i2v-250428");
  const img1 = "11111111-1111-4111-8111-111111111111";
  const img2 = "22222222-2222-4222-8222-222222222222";

  it("passes a supported text-to-video request", () => {
    expect(checkCapabilities(input(), pro15)).toEqual([]);
  });

  it("passes first+last frame on a model that supports both", () => {
    const req = input({ mode: "image-to-video", aspectRatio: "adaptive", firstFrameId: img1, lastFrameId: img2 });
    expect(checkCapabilities(req, pro15)).toEqual([]);
  });

  it("rejects a last frame on a first-frame-only model", () => {
    const req = input({ mode: "image-to-video", model: "seedance-1-0-pro-fast-251015", firstFrameId: img1, lastFrameId: img2 });
    expect(checkCapabilities(req, fast).map((i) => i.field)).toContain("lastFrameId");
  });

  it("requires a first frame for image-to-video", () => {
    expect(checkCapabilities(input({ mode: "image-to-video" }), pro15).map((i) => i.field)).toContain("firstFrameId");
  });

  it("rejects a last frame identical to the first", () => {
    const req = input({ mode: "image-to-video", firstFrameId: img1, lastFrameId: img1 });
    expect(checkCapabilities(req, pro15).map((i) => i.field)).toContain("lastFrameId");
  });

  it("rejects images in text-to-video mode", () => {
    expect(checkCapabilities(input({ firstFrameId: img1 }), pro15).map((i) => i.field)).toContain("mode");
  });

  it("rejects image input on a text-only model and text-only on an image-only model", () => {
    const i2v = input({ mode: "image-to-video", firstFrameId: img1 });
    expect(checkCapabilities(i2v, liteT2v).some((i) => i.field === "mode")).toBe(true);
    expect(checkCapabilities(input(), liteI2v).some((i) => i.field === "mode")).toBe(true);
  });

  it("rejects unsupported duration, resolution, ratio and audio", () => {
    const fields = checkCapabilities(
      input({ duration: 7, resolution: "1080p", aspectRatio: "adaptive", generateAudio: true }),
      liteT2v,
    ).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["duration", "resolution", "aspectRatio", "generateAudio"]));
  });

  it("rejects seed and fixed camera on the fallback profile", () => {
    const fields = checkCapabilities(input({ seed: 42, cameraFixed: true }), FALLBACK_CAPABILITIES).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["seed", "cameraFixed"]));
  });
});
