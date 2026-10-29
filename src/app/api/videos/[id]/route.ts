import { connection } from "next/server";

import { AppError } from "@/lib/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { getGenerationService } from "@/lib/services/generation-service";
import { UUID_V4_PATTERN } from "@/lib/validations/video";

function assertId(id: string) {
  if (!UUID_V4_PATTERN.test(id)) throw new AppError("NOT_FOUND", "Generation not found.");
}

/** Current state of one generation; refreshes from the provider while in flight. */
export async function GET(_request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  await connection();
  try {
    const { id } = await ctx.params;
    assertId(id);
    return jsonOk({ generation: await getGenerationService().get(id) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Remove a generation from history. Does not cancel or delete anything at the provider. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  try {
    const { id } = await ctx.params;
    assertId(id);
    await getGenerationService().delete(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
