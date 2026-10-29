import { describe, expect, it, vi } from "vitest";

import { EnvValidationError, getConfigWarnings, parseEnv } from "@/lib/env";
import { BytePlusVideoProvider } from "@/lib/video/byteplus-provider";
import { createProvider } from "@/lib/video/factory";
import { MockVideoProvider } from "@/lib/video/mock-provider";

import { videoRequest, withTempDir } from "./helpers/fixtures";

describe("parseEnv", () => {
  it("defaults to mock mode with documented defaults", () => {
    const env = parseEnv({});
    expect(env.videoProvider).toBe("mock");
    expect(env.arkBaseUrl).toBe("https://ark.ap-southeast.bytepluses.com/api/v3");
    expect(env.arkModel).toBe("seedance-1-5-pro-251215");
    expect(env.arkApiKey).toBeUndefined();
    expect(env.mongodbUri).toBeUndefined();
  });

  it("treats empty strings as unset (matches .env.example)", () => {
    const env = parseEnv({ VIDEO_PROVIDER: "", ARK_API_KEY: "", MONGODB_URI: "", ARK_MODEL: "" });
    expect(env.videoProvider).toBe("mock");
    expect(env.arkApiKey).toBeUndefined();
    expect(env.mongodbUri).toBeUndefined();
  });

  it("parses extra models and strips trailing slashes", () => {
    const env = parseEnv({
      ARK_BASE_URL: "https://ark.ap-southeast.bytepluses.com/api/v3/",
      ARK_EXTRA_MODELS: " seedance-1-0-pro-250528 , ,seedance-1-5-pro-251215",
    });
    expect(env.arkBaseUrl).toBe("https://ark.ap-southeast.bytepluses.com/api/v3");
    expect(env.arkExtraModels).toEqual(["seedance-1-0-pro-250528"]);
  });

  it.each([
    ["unknown provider", { VIDEO_PROVIDER: "openai" }],
    ["http base URL", { ARK_BASE_URL: "http://ark.example.com" }],
    ["invalid model id", { ARK_MODEL: "bad model id!" }],
    ["invalid mongo uri", { MONGODB_URI: "postgres://x" }],
    ["out-of-range timeout", { ARK_REQUEST_TIMEOUT_MS: "5" }],
  ])("rejects %s", (_label, source) => {
    expect(() => parseEnv(source)).toThrow(EnvValidationError);
  });

  it("warns when byteplus is selected without a key", () => {
    expect(getConfigWarnings(parseEnv({ VIDEO_PROVIDER: "byteplus" }))).toHaveLength(1);
    expect(getConfigWarnings(parseEnv({ VIDEO_PROVIDER: "byteplus", ARK_API_KEY: "k" }))).toHaveLength(0);
  });
});

describe("createProvider", () => {
  it("selects the mock provider by default", () =>
    withTempDir(async (dir) => {
      const provider = createProvider(parseEnv({ DATA_DIR: dir }));
      expect(provider).toBeInstanceOf(MockVideoProvider);
      expect(provider.name).toBe("mock");
    }));

  it("selects BytePlus only when explicitly configured", () => {
    const provider = createProvider(parseEnv({ VIDEO_PROVIDER: "byteplus", ARK_API_KEY: "k" }), {
      imageStorage: { kind: "test", save: vi.fn(), get: vi.fn(), read: vi.fn() },
    });
    expect(provider).toBeInstanceOf(BytePlusVideoProvider);
  });

  it("raises CONFIG_ERROR instead of silently falling back to mock", () => {
    expect(() => createProvider(parseEnv({ VIDEO_PROVIDER: "byteplus" }))).toThrow(
      expect.objectContaining({ code: "CONFIG_ERROR" }),
    );
  });

  it("mock mode never calls the network", () =>
    withTempDir(async (dir) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const provider = createProvider(parseEnv({ DATA_DIR: dir, ARK_API_KEY: "would-be-real-key" }));
      const task = await provider.createTask(videoRequest());
      await provider.getTask(task.providerTaskId);
      expect(fetchSpy).not.toHaveBeenCalled();
    }));
});
