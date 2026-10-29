import { connection } from "next/server";

import { getPublicConfig } from "@/lib/app-config";
import { jsonError, jsonOk } from "@/lib/http";

/** Non-secret runtime configuration and provider status. Never makes provider calls. */
export async function GET() {
  await connection();
  try {
    return jsonOk(await getPublicConfig());
  } catch (error) {
    return jsonError(error);
  }
}
