import "server-only";

import { getGenerationRepository } from "@/lib/db";
import { getConfigWarnings, getEnv } from "@/lib/env";
import { getImageStorage } from "@/lib/storage/image-storage";
import { buildModelOptions, IMAGE_CONSTRAINTS, PROMPT_MAX_LENGTH } from "@/lib/video/capabilities";
import { MOCK_FAIL_KEYWORD } from "@/lib/video/mock-provider";
import { getModelStatuses } from "@/lib/video/model-status";
import type { ModelAvailabilityState, PublicAppConfig } from "@/types/config";

export async function getPublicConfig(): Promise<PublicAppConfig> {
  const env = getEnv();
  const warnings = getConfigWarnings(env);
  const mockMode = env.videoProvider === "mock";
  const statuses = mockMode ? {} : await getModelStatuses();

  const models = buildModelOptions(env.arkModel, env.arkExtraModels).map((option) => {
    let availability: ModelAvailabilityState;
    if (mockMode) availability = "simulated";
    else if (!env.arkApiKey) availability = "misconfigured";
    else availability = statuses[option.id]?.state ?? "unknown";
    return {
      ...option,
      availability,
      availabilityCheckedAt: statuses[option.id]?.checkedAt,
      availabilityCode: statuses[option.id]?.providerCode,
    };
  });

  return {
    status: warnings.length ? "degraded" : "ok",
    provider: env.videoProvider,
    mockMode,
    apiKeyConfigured: Boolean(env.arkApiKey),
    baseUrl: env.arkBaseUrl,
    defaultModel: env.arkModel,
    models,
    storage: {
      history: getGenerationRepository().kind,
      uploads: getImageStorage().kind,
    },
    limits: {
      maxImageBytes: IMAGE_CONSTRAINTS.maxBytes,
      imageTypes: [...IMAGE_CONSTRAINTS.mimeTypes],
      minImageSide: IMAGE_CONSTRAINTS.minSide,
      maxImageSide: IMAGE_CONSTRAINTS.maxSide,
      promptMaxLength: PROMPT_MAX_LENGTH,
    },
    polling: mockMode
      ? { intervalMs: 1_200, maxIntervalMs: 3_000, maxDurationMs: 5 * 60_000 }
      : { intervalMs: 4_000, maxIntervalMs: 15_000, maxDurationMs: 20 * 60_000 },
    mock: {
      queueMs: env.mockQueueMs,
      runMs: env.mockRunMs,
      failKeyword: MOCK_FAIL_KEYWORD,
    },
    warnings,
  };
}
