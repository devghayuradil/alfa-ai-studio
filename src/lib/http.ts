import "server-only";

import { AppError, type ApiErrorBody, toAppError } from "@/lib/errors";
import { EnvValidationError } from "@/lib/env";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonOk<T>(data: T, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

/** Convert any thrown value into a safe JSON error response. */
export function jsonError(error: unknown): Response {
  let appError: AppError;
  if (error instanceof EnvValidationError) {
    console.error("[config]", error.message);
    appError = new AppError("CONFIG_ERROR", "Server configuration is invalid. Check the server logs and your .env.local.");
  } else {
    appError = toAppError(error);
  }

  if (appError.code === "INTERNAL_ERROR" || appError.code === "STORAGE_ERROR") {
    console.error(`[api] ${appError.code}`, appError.cause ?? appError);
  } else if (appError.status >= 500 || appError.providerCode) {
    console.warn(`[api] ${appError.code}${appError.providerCode ? ` (${appError.providerCode})` : ""}: ${appError.message}`);
  }

  const body: ApiErrorBody = { error: appError.toJSON() };
  const headers: Record<string, string> = { ...NO_STORE };
  if (appError.code === "RATE_LIMITED") headers["Retry-After"] = "10";
  return Response.json(body, { status: appError.status, headers });
}

/** Read and parse a JSON body with a hard size cap. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Expected a JSON request body.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body is not valid JSON.");
  }
}
