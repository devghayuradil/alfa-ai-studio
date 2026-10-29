import { AppError, type AppErrorCode } from "@/lib/errors";
import type { TaskError } from "@/types/video";

export interface ArkErrorInfo {
  httpStatus?: number;
  code?: string;
  message?: string;
  requestId?: string;
}

/** Extract `{ error: { code, message } }` (or a flat `{ code, message }`) from an error body. */
export function parseArkErrorBody(body: unknown): { code?: string; message?: string } {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const inner = (record.error && typeof record.error === "object" ? record.error : record) as Record<
    string,
    unknown
  >;
  return {
    code: typeof inner.code === "string" ? inner.code : undefined,
    message: typeof inner.message === "string" ? inner.message : undefined,
  };
}

interface Classification {
  code: AppErrorCode;
  message: string;
}

/**
 * Classify a provider error by its ModelArk error code first, then HTTP status.
 * Messages are written for the end user and never include secrets.
 */
export function classifyArkError(info: ArkErrorInfo): Classification {
  const providerCode = info.code ?? "";
  const lower = providerCode.toLowerCase();

  if (providerCode === "ModelNotOpen") {
    return {
      code: "MODEL_NOT_OPEN",
      message:
        "This Seedance model is not activated for your BytePlus account. Activate it in the ModelArk console (Model activation), or switch back to VIDEO_PROVIDER=mock.",
    };
  }
  if (lower.startsWith("invalidendpointormodel")) {
    return {
      code: "MODEL_NOT_FOUND",
      message:
        "The configured model or endpoint ID was not found. Check ARK_MODEL against the model IDs listed in your ModelArk console.",
    };
  }
  if (lower.includes("authentication") || lower === "invalidapikey" || info.httpStatus === 401) {
    return {
      code: "AUTH_ERROR",
      message: "BytePlus rejected the API key. Check ARK_API_KEY in your server environment.",
    };
  }
  if (lower.includes("sensitivecontent") || lower.includes("contentfilter") || lower.includes("risk")) {
    return {
      code: "CONTENT_REJECTED",
      message: "The prompt or image was rejected by the provider's content safety checks. Try rephrasing.",
    };
  }
  if (lower.includes("quotaexceeded") || lower.includes("insufficient") || lower.includes("overdue")) {
    return {
      code: "QUOTA_EXCEEDED",
      message: "Your BytePlus account has no remaining quota or balance for this model.",
    };
  }
  if (lower.includes("ratelimit") || lower.includes("serveroverloaded") || info.httpStatus === 429) {
    return {
      code: "RATE_LIMITED",
      message: "BytePlus is rate limiting requests right now. Wait a moment and try again.",
    };
  }
  if (lower.includes("accessdenied") || lower.includes("forbidden") || info.httpStatus === 403) {
    return {
      code: "PERMISSION_DENIED",
      message: "Your BytePlus account does not have permission for this operation or model.",
    };
  }
  if (info.httpStatus === 404) {
    return { code: "NOT_FOUND", message: "The generation task was not found at BytePlus." };
  }
  if (lower.startsWith("invalidparameter") || lower.includes("missingparameter") || info.httpStatus === 400) {
    return {
      code: "PROVIDER_BAD_REQUEST",
      message: `BytePlus rejected the request parameters${info.message ? `: ${truncate(info.message)}` : "."}`,
    };
  }
  if ((info.httpStatus ?? 0) >= 500 || lower.includes("internalservice") || lower.includes("serviceunavailable")) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: "BytePlus is temporarily unavailable. Please try again shortly.",
    };
  }
  return {
    code: "TASK_FAILED",
    message: info.message ? truncate(info.message) : "The provider returned an unexpected error.",
  };
}

export function normalizeArkError(info: ArkErrorInfo): AppError {
  const { code, message } = classifyArkError(info);
  return new AppError(code, message, {
    providerCode: info.code,
    requestId: info.requestId,
  });
}

/** Errors reported inside a failed task object (status=failed). */
export function normalizeArkTaskError(error: { code?: string; message?: string } | null | undefined): TaskError {
  if (!error || (!error.code && !error.message)) {
    return { code: "TASK_FAILED", message: "Generation failed at the provider without details.", retryable: true };
  }
  const classified = classifyArkError({ code: error.code, message: error.message });
  const code = classified.code === "PROVIDER_BAD_REQUEST" || classified.code === "NOT_FOUND" ? "TASK_FAILED" : classified.code;
  return {
    code,
    providerCode: error.code,
    message: code === "TASK_FAILED" && error.message ? truncate(error.message) : classified.message,
    retryable: code === "TASK_FAILED" || code === "PROVIDER_UNAVAILABLE" || code === "RATE_LIMITED",
  };
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
