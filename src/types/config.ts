import type { ModelOption } from "@/lib/video/capabilities";
import type { ProviderName } from "@/types/video";

export type ModelAvailabilityState =
  | "simulated"
  | "unknown"
  | "available"
  | "not_open"
  | "not_found"
  | "auth_error"
  | "quota_exceeded"
  | "misconfigured";

export interface PublicModelOption extends ModelOption {
  availability: ModelAvailabilityState;
  availabilityCheckedAt?: string;
  availabilityCode?: string;
}

/** Non-secret runtime configuration exposed to the browser via /api/health. */
export interface PublicAppConfig {
  status: "ok" | "degraded";
  provider: ProviderName;
  mockMode: boolean;
  apiKeyConfigured: boolean;
  baseUrl: string;
  defaultModel: string;
  models: PublicModelOption[];
  storage: {
    history: "mongodb" | "local-file";
    uploads: string;
  };
  limits: {
    maxImageBytes: number;
    imageTypes: string[];
    minImageSide: number;
    maxImageSide: number;
    promptMaxLength: number;
  };
  polling: {
    intervalMs: number;
    maxIntervalMs: number;
    maxDurationMs: number;
  };
  mock: {
    queueMs: number;
    runMs: number;
    failKeyword: string;
  };
  warnings: string[];
}
