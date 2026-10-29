import "server-only";

import path from "node:path";

import { getEnv, type ServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getImageStorage, type ImageStorage } from "@/lib/storage/image-storage";
import { JsonDocumentStore } from "@/lib/storage/json-store";
import { BytePlusVideoProvider } from "@/lib/video/byteplus-provider";
import { type MockTaskDocument, MockVideoProvider } from "@/lib/video/mock-provider";
import type { VideoProvider } from "@/lib/video/provider";

export interface ProviderDeps {
  imageStorage?: ImageStorage;
  fetchImpl?: typeof fetch;
}

/**
 * Select the provider strictly from VIDEO_PROVIDER. There is intentionally no
 * fallback: a misconfigured "byteplus" setup raises a CONFIG_ERROR instead of
 * silently switching modes, and "mock" never makes network calls.
 */
export function createProvider(env: ServerEnv, deps: ProviderDeps = {}): VideoProvider {
  switch (env.videoProvider) {
    case "mock":
      return new MockVideoProvider({
        store: new JsonDocumentStore<MockTaskDocument>(path.join(env.dataDir, "mock-tasks")),
        queueMs: env.mockQueueMs,
        runMs: env.mockRunMs,
      });
    case "byteplus": {
      if (!env.arkApiKey) {
        throw new AppError(
          "CONFIG_ERROR",
          "VIDEO_PROVIDER=byteplus requires ARK_API_KEY. Set it in .env.local or switch back to VIDEO_PROVIDER=mock.",
        );
      }
      const storage = deps.imageStorage ?? getImageStorage();
      return new BytePlusVideoProvider({
        apiKey: env.arkApiKey,
        baseUrl: env.arkBaseUrl,
        timeoutMs: env.arkRequestTimeoutMs,
        fetchImpl: deps.fetchImpl,
        readImage: async (image) => {
          const stored = await storage.read(image.id);
          if (!stored) throw new AppError("NOT_FOUND", "A reference image is no longer available. Upload it again.");
          return stored.bytes;
        },
      });
    }
    default: {
      const exhaustive: never = env.videoProvider;
      throw new AppError("CONFIG_ERROR", `Unknown VIDEO_PROVIDER: ${String(exhaustive)}`);
    }
  }
}

const providers = new Map<string, VideoProvider>();

/** The provider selected by VIDEO_PROVIDER, used for new generations. */
export function getProvider(): VideoProvider {
  const env = getEnv();
  let provider = providers.get(env.videoProvider);
  if (!provider) {
    provider = createProvider(env);
    providers.set(env.videoProvider, provider);
  }
  return provider;
}

/**
 * Provider able to refresh an existing record. Mock records can always be
 * resolved (no network). BytePlus records are only refreshed when BytePlus is
 * the active provider, so Mock Mode can never trigger a real API call.
 */
export function getProviderForRecord(name: VideoProvider["name"]): VideoProvider | null {
  const env = getEnv();
  if (name === env.videoProvider) return getProvider();
  if (name === "mock") {
    let mock = providers.get("mock");
    if (!mock) {
      mock = createProvider({ ...env, videoProvider: "mock" });
      providers.set("mock", mock);
    }
    return mock;
  }
  return null;
}
