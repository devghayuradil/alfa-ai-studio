import { describe, expect, it } from "vitest";

import { buildCreateTaskBody, normalizeArkStatus, redactBody, toDataUri } from "@/lib/video/byteplus-payload";

import { pngBytes, sampleImage, videoRequest } from "./helpers/fixtures";

const image = { image: sampleImage, bytes: pngBytes(1280, 720) };
const lastImage = { image: { ...sampleImage, id: "22222222-2222-4222-8222-222222222222" }, bytes: pngBytes(1280, 720) };

describe("buildCreateTaskBody", () => {
  it("builds a text-to-video payload with documented field names", () => {
    const body = buildCreateTaskBody(videoRequest({ generateAudio: true, watermark: true }));
    expect(body).toEqual({
      model: "seedance-1-5-pro-251215",
      content: [{ type: "text", text: "A cinematic drone shot over mountains" }],
      ratio: "16:9",
      duration: 5,
      resolution: "720p",
      watermark: true,
      generate_audio: true,
    });
  });

  it("sends generate_audio=false explicitly for audio-capable models", () => {
    expect(buildCreateTaskBody(videoRequest()).generate_audio).toBe(false);
  });

  it("omits parameters the model does not support", () => {
    const body = buildCreateTaskBody(
      videoRequest({ model: "ep-custom-endpoint", generateAudio: true, cameraFixed: true, seed: 7 }),
    );
    expect(body).not.toHaveProperty("generate_audio");
    expect(body).not.toHaveProperty("camera_fixed");
    expect(body).not.toHaveProperty("seed");
  });

  it("includes camera_fixed and seed only when set on a supporting model", () => {
    expect(buildCreateTaskBody(videoRequest())).not.toHaveProperty("camera_fixed");
    expect(buildCreateTaskBody(videoRequest())).not.toHaveProperty("seed");
    const body = buildCreateTaskBody(videoRequest({ cameraFixed: true, seed: 42 }));
    expect(body.camera_fixed).toBe(true);
    expect(body.seed).toBe(42);
  });

  it("builds an image-to-video payload with first and last frame roles as base64 data URIs", () => {
    const body = buildCreateTaskBody(videoRequest({ mode: "image-to-video", aspectRatio: "adaptive" }), {
      firstFrame: image,
      lastFrame: lastImage,
    });
    expect(body.ratio).toBe("adaptive");
    expect(body.content).toHaveLength(3);
    expect(body.content[1]).toMatchObject({ type: "image_url", role: "first_frame" });
    expect(body.content[2]).toMatchObject({ type: "image_url", role: "last_frame" });
    const url = (body.content[1] as { image_url: { url: string } }).image_url.url;
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(url.split(",")[1], "base64")).toEqual(Buffer.from(image.bytes));
  });

  it("drops a last frame for models without last-frame support", () => {
    const body = buildCreateTaskBody(
      videoRequest({ mode: "image-to-video", model: "seedance-1-0-pro-fast-251015" }),
      { firstFrame: image, lastFrame: lastImage },
    );
    expect(body.content.filter((c) => c.type === "image_url")).toHaveLength(1);
  });

  it("refuses image-to-video without a first frame", () => {
    expect(() => buildCreateTaskBody(videoRequest({ mode: "image-to-video" }))).toThrow();
  });

  it("never includes image data in text-to-video payloads", () => {
    const body = buildCreateTaskBody(videoRequest(), { firstFrame: image });
    expect(body.content).toHaveLength(1);
  });

  it("redacts image payloads for logging", () => {
    const body = buildCreateTaskBody(videoRequest({ mode: "image-to-video" }), { firstFrame: image });
    expect(JSON.stringify(redactBody(body))).not.toContain("base64");
  });

  it("encodes JPEG and WebP with the right format token", () => {
    expect(toDataUri({ image: { ...sampleImage, mimeType: "image/jpeg" }, bytes: new Uint8Array([1]) })).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(toDataUri({ image: { ...sampleImage, mimeType: "image/webp" }, bytes: new Uint8Array([1]) })).toMatch(
      /^data:image\/webp;base64,/,
    );
  });
});

describe("normalizeArkStatus", () => {
  it.each([
    ["queued", "queued"],
    ["running", "running"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["expired", "failed"],
    ["cancelled", "cancelled"],
    ["SUCCEEDED", "succeeded"],
    ["something-new", "running"],
    [undefined, "running"],
  ] as const)("maps %s → %s", (input, expected) => {
    expect(normalizeArkStatus(input)).toBe(expected);
  });
});
