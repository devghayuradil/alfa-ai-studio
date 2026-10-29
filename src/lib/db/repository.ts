import type { GenerationRecord } from "@/types/video";

export interface ListOptions {
  limit?: number;
}

/** Persistence contract for generation history. */
export interface GenerationRepository {
  readonly kind: "mongodb" | "local-file";
  create(record: GenerationRecord): Promise<GenerationRecord>;
  findById(id: string): Promise<GenerationRecord | null>;
  findByClientRequestId(clientRequestId: string): Promise<GenerationRecord | null>;
  update(id: string, patch: Partial<GenerationRecord>): Promise<GenerationRecord | null>;
  list(options?: ListOptions): Promise<GenerationRecord[]>;
  delete(id: string): Promise<boolean>;
}

export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 500;
