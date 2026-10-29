import { connection } from "next/server";

import { AppError } from "@/lib/errors";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http";
import { clientKey, generationLimiter } from "@/lib/rate-limit";
import { getGenerationService } from "@/lib/services/generation-service";
import { createVideoSchema, zodIssuesToFieldIssues } from "@/lib/validations/video";

const MAX_BODY_BYTES = 32 * 1024;

/** List generation history (newest first). */
export async function GET(request: Request) {
  await connection();
  try {
    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(500, Number.parseInt(limitParam, 10) || 100)) : undefined;
    const generations = await getGenerationService().list(limit);
    return jsonOk({ generations });
  } catch (error) {
    return jsonError(error);
  }
}

/** Validate a request and start a generation task. */
export async function POST(request: Request) {
  try {
    generationLimiter.enforce(clientKey(request), "generation requests");
    const body = await readJsonBody(request, MAX_BODY_BYTES);
    const parsed = createVideoSchema.safeParse(body);
    if (!parsed.success) {
      const issues = zodIssuesToFieldIssues(parsed.error);
      throw new AppError("VALIDATION_ERROR", issues[0]?.message ?? "Invalid request.", { issues });
    }
    const { record, duplicate } = await getGenerationService().create(parsed.data);
    return jsonOk({ generation: record, duplicate }, { status: duplicate ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
