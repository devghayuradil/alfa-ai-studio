import { describe, expect, it, vi } from "vitest";

import { classifyArkError, normalizeArkTaskError, parseArkErrorBody } from "@/lib/video/byteplus-errors";
import { BytePlusVideoProvider, mapArkTask } from "@/lib/video/byteplus-provider";

import { jsonResponse, pngBytes, sampleImage, videoRequest } from "./helpers/fixtures";

const BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

function provider(fetchImpl: typeof fetch, timeoutMs = 5_000) {
  return new BytePlusVideoProvider({
    apiKey: "test-key-123",
    baseUrl: BASE_URL,
    timeoutMs,
    fetchImpl,
    readImage: async () => pngBytes(1280, 720),
  });
}

function errorBody(code: string, message = "error message") {
  return { error: { code, message, param: "", type: "" } };
}

describe("BytePlusVideoProvider.createTask", () => {
  it("POSTs to the task endpoint with bearer auth and returns the task id", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { id: "cgt-20260101-abc" }));
    const task = await provider(fetchMock).createTask(videoRequest());

    expect(task).toMatchObject({ providerTaskId: "cgt-20260101-abc", status: "queued", isDemo: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/contents/generations/tasks`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key-123");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "seedance-1-5-pro-251215", duration: 5, ratio: "16:9" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reads reference images server-side and sends them inline", async () => {
    const readImage = vi.fn(async () => pngBytes(1280, 720));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { id: "cgt-1" }));
    const p = new BytePlusVideoProvider({ apiKey: "k", baseUrl: BASE_URL, timeoutMs: 1000, fetchImpl: fetchMock, readImage });
    await p.createTask(videoRequest({ mode: "image-to-video", firstFrame: sampleImage }));
    expect(readImage).toHaveBeenCalledWith(sampleImage);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it.each([
    [404, "ModelNotOpen", "MODEL_NOT_OPEN"],
    [404, "InvalidEndpointOrModel.NotFound", "MODEL_NOT_FOUND"],
    [401, "AuthenticationError", "AUTH_ERROR"],
    [429, "RateLimitExceeded.EndpointRPMExceeded", "RATE_LIMITED"],
    [429, "ServerOverloaded", "RATE_LIMITED"],
    [400, "InvalidParameter", "PROVIDER_BAD_REQUEST"],
    [400, "InputTextSensitiveContentDetected", "CONTENT_REJECTED"],
    [403, "AccountOverdueError", "QUOTA_EXCEEDED"],
    [500, "InternalServiceError", "PROVIDER_UNAVAILABLE"],
    [503, "", "PROVIDER_UNAVAILABLE"],
  ])("normalizes HTTP %i %s → %s", async (status, code, expected) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(status, errorBody(code), { "x-request-id": "req-42" }));
    const error = await provider(fetchMock).createTask(videoRequest()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: expected, requestId: "req-42" });
    if (code) expect(error).toMatchObject({ providerCode: code });
  });

  it("marks transient errors retryable and access errors not", async () => {
    const rate = await provider(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(429, errorBody("RateLimitExceeded"))))
      .createTask(videoRequest())
      .catch((e: unknown) => e);
    const notOpen = await provider(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(404, errorBody("ModelNotOpen"))))
      .createTask(videoRequest())
      .catch((e: unknown) => e);
    expect(rate).toMatchObject({ retryable: true });
    expect(notOpen).toMatchObject({ retryable: false });
  });

  it("never leaks the API key in error messages", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(401, errorBody("AuthenticationError")));
    const error = (await provider(fetchMock).createTask(videoRequest()).catch((e: unknown) => e)) as Error;
    expect(JSON.stringify(error)).not.toContain("test-key-123");
    expect(error.message).not.toContain("test-key-123");
  });

  it("maps network failures and timeouts", async () => {
    const network = await provider(vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")))
      .createTask(videoRequest())
      .catch((e: unknown) => e);
    expect(network).toMatchObject({ code: "NETWORK_ERROR", retryable: true });

    const timeoutError = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const timeout = await provider(vi.fn<typeof fetch>().mockRejectedValue(timeoutError))
      .createTask(videoRequest())
      .catch((e: unknown) => e);
    expect(timeout).toMatchObject({ code: "PROVIDER_TIMEOUT", retryable: true });
  });

  it("aborts slow requests using the configured timeout", async () => {
    const hanging = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });
    const error = await provider(hanging, 20).createTask(videoRequest()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });

  it("handles non-JSON error bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(provider(fetchMock).createTask(videoRequest())).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("rejects a success response without a task id", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, {}));
    await expect(provider(fetchMock).createTask(videoRequest())).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("refuses to construct without an API key", () => {
    expect(
      () =>
        new BytePlusVideoProvider({ apiKey: "", baseUrl: BASE_URL, timeoutMs: 1000, readImage: async () => new Uint8Array() }),
    ).toThrow(/ARK_API_KEY/);
  });
});

describe("BytePlusVideoProvider.getTask", () => {
  it("GETs the task and extracts the video URL on success", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        id: "cgt-1",
        model: "seedance-1-5-pro-251215",
        status: "succeeded",
        content: { video_url: "https://example-bucket.bytepluses.com/video.mp4?sig=1" },
      }),
    );
    const task = await provider(fetchMock).getTask("cgt-1");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URL}/contents/generations/tasks/cgt-1`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
    expect(task).toMatchObject({ status: "succeeded", videoUrl: "https://example-bucket.bytepluses.com/video.mp4?sig=1" });
  });

  it("rejects malformed task IDs before making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(provider(fetchMock).getTask("../../secrets")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports task-level failures with normalized errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        id: "cgt-2",
        status: "failed",
        error: { code: "OutputVideoSensitiveContentDetected", message: "flagged" },
      }),
    );
    const task = await provider(fetchMock).getTask("cgt-2");
    expect(task.status).toBe("failed");
    expect(task.error).toMatchObject({ code: "CONTENT_REJECTED", providerCode: "OutputVideoSensitiveContentDetected" });
  });

  it("treats success without a usable https URL as a failure", () => {
    expect(mapArkTask("x", { id: "x", status: "succeeded", content: {} }).status).toBe("failed");
    expect(mapArkTask("x", { id: "x", status: "succeeded", content: { video_url: "file:///etc/passwd" } }).status).toBe(
      "failed",
    );
  });

  it("maps cancelled tasks", () => {
    const task = mapArkTask("x", { id: "x", status: "cancelled" });
    expect(task.status).toBe("cancelled");
    expect(task.error).toBeDefined();
  });
});

describe("error helpers", () => {
  it("parses nested and flat error bodies", () => {
    expect(parseArkErrorBody({ error: { code: "A", message: "m" } })).toEqual({ code: "A", message: "m" });
    expect(parseArkErrorBody({ code: "B", message: "n" })).toEqual({ code: "B", message: "n" });
    expect(parseArkErrorBody("nope")).toEqual({});
  });

  it("classifies by code before status", () => {
    expect(classifyArkError({ httpStatus: 400, code: "ModelNotOpen" }).code).toBe("MODEL_NOT_OPEN");
  });

  it("produces a generic task error when the provider gives no details", () => {
    expect(normalizeArkTaskError(null)).toMatchObject({ code: "TASK_FAILED", retryable: true });
  });
});
