import { promises as fs } from "node:fs";
import path from "node:path";
import { connection } from "next/server";

import { getGenerationRepository } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { UUID_V4_PATTERN } from "@/lib/validations/video";
import { DEMO_VIDEOS } from "@/lib/video/mock-provider";

const DEMO_PATHS = new Set(Object.values(DEMO_VIDEOS));
const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Download a finished video with a friendly filename.
 * - Demo videos are served from the bundled allow-list only.
 * - Provider videos are fetched from the URL the provider returned (stored
 *   server-side, never taken from the client), so there is no SSRF vector.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/videos/[id]/download">) {
  await connection();
  try {
    const { id } = await ctx.params;
    if (!UUID_V4_PATTERN.test(id)) throw new AppError("NOT_FOUND", "Generation not found.");
    const record = await getGenerationRepository().findById(id);
    if (!record || record.status !== "succeeded" || !record.videoUrl) {
      throw new AppError("NOT_FOUND", "No finished video for this generation.");
    }

    const shortId = record.id.slice(0, 8);
    if (record.isDemo) {
      if (!DEMO_PATHS.has(record.videoUrl)) throw new AppError("NOT_FOUND", "Demo asset not found.");
      const file = path.join(/* turbopackIgnore: true */ process.cwd(), "public", record.videoUrl);
      const bytes = await fs.readFile(file);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": `attachment; filename="alfa-demo-not-ai-generated-${shortId}.mp4"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (!/^https:\/\//i.test(record.videoUrl)) throw new AppError("NOT_FOUND", "Video URL is not downloadable.");
    let upstream: Response;
    try {
      upstream = await fetch(record.videoUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), cache: "no-store" });
    } catch (error) {
      throw new AppError("NETWORK_ERROR", "Could not download the video from the provider.", { cause: error });
    }
    if (!upstream.ok || !upstream.body) {
      throw new AppError(
        "NOT_FOUND",
        "The provider's video link is no longer available (BytePlus links expire after a limited time).",
      );
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
        ...(upstream.headers.get("content-length")
          ? { "Content-Length": upstream.headers.get("content-length") as string }
          : {}),
        "Content-Disposition": `attachment; filename="alfa-${record.model}-${shortId}.mp4"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
