import { connection } from "next/server";

import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { getImageStorage } from "@/lib/storage/image-storage";

/** Serve an uploaded reference image by ID (used for previews in history). */
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  await connection();
  try {
    const { id } = await ctx.params;
    const stored = await getImageStorage().read(id);
    if (!stored) throw new AppError("NOT_FOUND", "Image not found.");
    return new Response(new Uint8Array(stored.bytes), {
      headers: {
        "Content-Type": stored.image.mimeType,
        "Content-Length": String(stored.bytes.byteLength),
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
