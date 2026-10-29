import "server-only";

import { JsonDocumentStore } from "@/lib/storage/json-store";
import { DEFAULT_LIST_LIMIT, type GenerationRepository, type ListOptions, MAX_LIST_LIMIT } from "@/lib/db/repository";
import type { GenerationRecord } from "@/types/video";

/**
 * Local development history: one JSON file per generation under
 * DATA_DIR/generations. Good for a single user on one machine; not meant for
 * serverless/ephemeral hosting (use MONGODB_URI there).
 */
export class FileGenerationRepository implements GenerationRepository {
  readonly kind = "local-file" as const;
  private readonly store: JsonDocumentStore<GenerationRecord>;

  constructor(directory: string) {
    this.store = new JsonDocumentStore<GenerationRecord>(directory);
  }

  async create(record: GenerationRecord) {
    return this.store.put(record);
  }

  async findById(id: string) {
    return this.store.get(id);
  }

  async findByClientRequestId(clientRequestId: string) {
    const all = await this.store.list();
    return all.find((record) => record.clientRequestId === clientRequestId) ?? null;
  }

  async update(id: string, patch: Partial<GenerationRecord>) {
    const existing = await this.store.get(id);
    if (!existing) return null;
    const next: GenerationRecord = { ...existing, ...patch, id: existing.id, updatedAt: new Date().toISOString() };
    return this.store.put(next);
  }

  async list(options: ListOptions = {}) {
    const limit = Math.min(options.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const all = await this.store.list();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async delete(id: string) {
    return this.store.delete(id);
  }
}
