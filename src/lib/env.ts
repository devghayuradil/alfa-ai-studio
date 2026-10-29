import "server-only";

import path from "node:path";
import { z } from "zod";

import { PROVIDER_NAMES } from "@/types/video";

const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/;

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : undefined));

const intFromEnv = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === "") return fallback;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        ctx.addIssue({ code: "custom", message: `must be an integer between ${min} and ${max}` });
        return z.NEVER;
      }
      return parsed;
    });

const envSchema = z.object({
  VIDEO_PROVIDER: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== "" ? value.trim().toLowerCase() : "mock"))
    .pipe(z.enum(PROVIDER_NAMES)),
  ARK_API_KEY: optionalString,
  ARK_BASE_URL: z
    .string()
    .optional()
    .transform((value) =>
      (value && value.trim() !== "" ? value.trim() : "https://ark.ap-southeast.bytepluses.com/api/v3").replace(
        /\/+$/,
        "",
      ),
    )
    .pipe(z.url({ protocol: /^https$/, error: "must be an https URL" })),
  ARK_MODEL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== "" ? value.trim() : "seedance-1-5-pro-251215"))
    .pipe(z.string().regex(MODEL_ID_PATTERN, "is not a valid model or endpoint ID")),
  ARK_EXTRA_MODELS: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(MODEL_ID_PATTERN, "contains an invalid model ID")).max(20)),
  ARK_REQUEST_TIMEOUT_MS: intFromEnv(30_000, 1_000, 120_000),
  MONGODB_URI: optionalString.pipe(
    z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://")
      .optional(),
  ),
  DATA_DIR: optionalString,
  MOCK_QUEUE_MS: intFromEnv(3_000, 0, 120_000),
  MOCK_RUN_MS: intFromEnv(9_000, 500, 600_000),
});

export interface ServerEnv {
  videoProvider: (typeof PROVIDER_NAMES)[number];
  arkApiKey?: string;
  arkBaseUrl: string;
  arkModel: string;
  arkExtraModels: string[];
  arkRequestTimeoutMs: number;
  mongodbUri?: string;
  dataDir: string;
  mockQueueMs: number;
  mockRunMs: number;
}

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n- ${issues.join("\n- ")}`);
    this.name = "EnvValidationError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"} ${issue.message}`),
    );
  }
  const env = result.data;
  return {
    videoProvider: env.VIDEO_PROVIDER,
    arkApiKey: env.ARK_API_KEY,
    arkBaseUrl: env.ARK_BASE_URL,
    arkModel: env.ARK_MODEL,
    arkExtraModels: env.ARK_EXTRA_MODELS.filter((id) => id !== env.ARK_MODEL),
    arkRequestTimeoutMs: env.ARK_REQUEST_TIMEOUT_MS,
    mongodbUri: env.MONGODB_URI,
    dataDir: path.resolve(/* turbopackIgnore: true */ process.cwd(), env.DATA_DIR ?? ".data"),
    mockQueueMs: env.MOCK_QUEUE_MS,
    mockRunMs: env.MOCK_RUN_MS,
  };
}

let cached: ServerEnv | undefined;

/** Validated server environment. Throws EnvValidationError on bad config. */
export function getEnv(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Problems that don't break startup but block real generation. */
export function getConfigWarnings(env: ServerEnv): string[] {
  const warnings: string[] = [];
  if (env.videoProvider === "byteplus" && !env.arkApiKey) {
    warnings.push("VIDEO_PROVIDER=byteplus but ARK_API_KEY is empty. Generation requests will be rejected.");
  }
  return warnings;
}

/** Test helper: forget the memoized env. */
export function resetEnvCache() {
  cached = undefined;
}
