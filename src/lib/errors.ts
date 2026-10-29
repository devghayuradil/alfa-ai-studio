/**
 * Application error model. Every failure that reaches an API response is
 * converted into an AppError so the client always receives a stable `code`
 * and a human-readable, secret-free `message`.
 */

export const APP_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNSUPPORTED_FEATURE",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "NOT_FOUND",
  "RATE_LIMITED",
  "DUPLICATE_REQUEST",
  "CONFIG_ERROR",
  "MODEL_NOT_OPEN",
  "MODEL_NOT_FOUND",
  "AUTH_ERROR",
  "PERMISSION_DENIED",
  "QUOTA_EXCEEDED",
  "CONTENT_REJECTED",
  "PROVIDER_BAD_REQUEST",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "NETWORK_ERROR",
  "TASK_FAILED",
  "STORAGE_ERROR",
  "INTERNAL_ERROR",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

const DEFAULT_HTTP_STATUS: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNSUPPORTED_FEATURE: 422,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  DUPLICATE_REQUEST: 409,
  CONFIG_ERROR: 503,
  MODEL_NOT_OPEN: 403,
  MODEL_NOT_FOUND: 404,
  AUTH_ERROR: 401,
  PERMISSION_DENIED: 403,
  QUOTA_EXCEEDED: 402,
  CONTENT_REJECTED: 422,
  PROVIDER_BAD_REQUEST: 400,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 504,
  NETWORK_ERROR: 502,
  TASK_FAILED: 500,
  STORAGE_ERROR: 500,
  INTERNAL_ERROR: 500,
};

const RETRYABLE: ReadonlySet<AppErrorCode> = new Set([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "NETWORK_ERROR",
]);

export interface FieldIssue {
  field: string;
  message: string;
}

export interface AppErrorOptions {
  status?: number;
  providerCode?: string;
  requestId?: string;
  issues?: FieldIssue[];
  retryable?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly providerCode?: string;
  readonly requestId?: string;
  readonly issues?: FieldIssue[];
  readonly retryable: boolean;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? DEFAULT_HTTP_STATUS[code];
    this.providerCode = options.providerCode;
    this.requestId = options.requestId;
    this.issues = options.issues;
    this.retryable = options.retryable ?? RETRYABLE.has(code);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.providerCode ? { providerCode: this.providerCode } : {}),
      ...(this.requestId ? { requestId: this.requestId } : {}),
      ...(this.issues?.length ? { issues: this.issues } : {}),
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function isRetryableCode(code: string): boolean {
  return RETRYABLE.has(code as AppErrorCode);
}

/** Wrap anything thrown into an AppError without leaking internals. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  return new AppError("INTERNAL_ERROR", "Something went wrong. Please try again.", { cause: error });
}

/** Body shape of every error response from our API. */
export interface ApiErrorBody {
  error: ReturnType<AppError["toJSON"]>;
}
