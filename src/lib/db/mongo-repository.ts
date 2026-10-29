import "server-only";

import { connectMongo } from "@/lib/db/mongoose";
import { DEFAULT_LIST_LIMIT, type GenerationRepository, type ListOptions, MAX_LIST_LIMIT } from "@/lib/db/repository";
import { type GenerationDocument, GenerationModel } from "@/models/generation";
import type { GenerationRecord } from "@/types/video";

type LeanGeneration = GenerationDocument;

function toRecord(doc: LeanGeneration): GenerationRecord {
  const { _id, createdAt, updatedAt, completedAt, lastCheckedAt, ...rest } = doc;
  return {
    ...rest,
    id: _id,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    ...(completedAt ? { completedAt: new Date(completedAt).toISOString() } : {}),
    ...(lastCheckedAt ? { lastCheckedAt: new Date(lastCheckedAt).toISOString() } : {}),
  };
}

function toDocumentFields(record: Partial<GenerationRecord>) {
  const { id, createdAt, updatedAt, completedAt, lastCheckedAt, ...rest } = record;
  return {
    ...rest,
    ...(id ? { _id: id } : {}),
    ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
    ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
    ...(completedAt ? { completedAt: new Date(completedAt) } : {}),
    ...(lastCheckedAt ? { lastCheckedAt: new Date(lastCheckedAt) } : {}),
  };
}

export class MongoGenerationRepository implements GenerationRepository {
  readonly kind = "mongodb" as const;

  constructor(private readonly uri: string) {}

  private async ready() {
    await connectMongo(this.uri);
  }

  async create(record: GenerationRecord) {
    await this.ready();
    await GenerationModel.create(toDocumentFields(record));
    return record;
  }

  async findById(id: string) {
    await this.ready();
    const doc = await GenerationModel.findById(id).lean<LeanGeneration>().exec();
    return doc ? toRecord(doc) : null;
  }

  async findByClientRequestId(clientRequestId: string) {
    await this.ready();
    const doc = await GenerationModel.findOne({ clientRequestId }).lean<LeanGeneration>().exec();
    return doc ? toRecord(doc) : null;
  }

  async update(id: string, patch: Partial<GenerationRecord>) {
    await this.ready();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _ignored, createdAt: _created, ...fields } = patch;
    const doc = await GenerationModel.findByIdAndUpdate(id, { $set: toDocumentFields(fields) }, { new: true })
      .lean<LeanGeneration>()
      .exec();
    return doc ? toRecord(doc) : null;
  }

  async list(options: ListOptions = {}) {
    await this.ready();
    const limit = Math.min(options.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const docs = await GenerationModel.find().sort({ createdAt: -1 }).limit(limit).lean<LeanGeneration[]>().exec();
    return docs.map(toRecord);
  }

  async delete(id: string) {
    await this.ready();
    const result = await GenerationModel.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }
}
