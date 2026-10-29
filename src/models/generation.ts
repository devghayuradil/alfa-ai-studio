import mongoose, { type Model, Schema } from "mongoose";

import { ASPECT_RATIOS, GENERATION_MODES, PROVIDER_NAMES, RESOLUTIONS, TASK_STATUSES } from "@/types/video";
import type { GenerationRecord } from "@/types/video";

export type GenerationDocument = Omit<GenerationRecord, "id" | "createdAt" | "updatedAt" | "completedAt" | "lastCheckedAt"> & {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  lastCheckedAt?: Date;
};

const taskErrorSchema = new Schema(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    providerCode: String,
    retryable: Boolean,
  },
  { _id: false },
);

/**
 * Generation history. Reference images are stored by ID only; image bytes
 * never go into MongoDB.
 */
const generationSchema = new Schema<GenerationDocument>(
  {
    _id: { type: String, required: true },
    clientRequestId: { type: String, required: true, unique: true },
    provider: { type: String, enum: PROVIDER_NAMES, required: true },
    providerTaskId: { type: String, required: true, index: true },
    mode: { type: String, enum: GENERATION_MODES, required: true },
    prompt: { type: String, required: true, maxlength: 4000 },
    model: { type: String, required: true },
    duration: { type: Number, required: true },
    aspectRatio: { type: String, enum: ASPECT_RATIOS, required: true },
    resolution: { type: String, enum: RESOLUTIONS, required: true },
    watermark: { type: Boolean, default: false },
    generateAudio: { type: Boolean, default: false },
    cameraFixed: { type: Boolean, default: false },
    seed: Number,
    firstFrameId: String,
    lastFrameId: String,
    status: { type: String, enum: TASK_STATUSES, required: true, index: true },
    providerStatus: String,
    progress: Number,
    videoUrl: String,
    isDemo: { type: Boolean, default: false },
    error: { type: taskErrorSchema, default: undefined },
    completedAt: Date,
    lastCheckedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

generationSchema.index({ createdAt: -1 });

export const GenerationModel: Model<GenerationDocument> =
  (mongoose.models.Generation as Model<GenerationDocument> | undefined) ??
  mongoose.model<GenerationDocument>("Generation", generationSchema);
