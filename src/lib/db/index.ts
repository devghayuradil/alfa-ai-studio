import "server-only";

import path from "node:path";

import { FileGenerationRepository } from "@/lib/db/file-repository";
import { MongoGenerationRepository } from "@/lib/db/mongo-repository";
import type { GenerationRepository } from "@/lib/db/repository";
import { getEnv } from "@/lib/env";

let repository: GenerationRepository | undefined;

/** MongoDB when MONGODB_URI is set, otherwise local JSON files. */
export function getGenerationRepository(): GenerationRepository {
  if (!repository) {
    const env = getEnv();
    repository = env.mongodbUri
      ? new MongoGenerationRepository(env.mongodbUri)
      : new FileGenerationRepository(path.join(env.dataDir, "generations"));
  }
  return repository;
}
