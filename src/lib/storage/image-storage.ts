import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { isNotFound, JsonDocumentStore } from "@/lib/storage/json-store";
import { validateImageBytes } from "@/lib/uploads/image-validation";
import { UUID_V4_PATTERN } from "@/lib/validations/video";
import type { StoredImage } from "@/types/video";

/**
 * Storage for reference images.
 *
 * Images are stored as binary files (never as base64 in the database) and
 * referenced by an opaque UUID. Providers read the bytes server-side when a
 * task is created. A cloud implementation (S3, TOS, R2…) only needs to
 * implement this interface.
 */
export interface ImageStorage {
  readonly kind: string;
  save(bytes: Uint8Array): Promise<StoredImage>;
  get(id: string): Promise<StoredImage | null>;
  read(id: string): Promise<{ image: StoredImage; bytes: Buffer } | null>;
}

const EXTENSIONS: Record<StoredImage["mimeType"], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Local-disk storage under DATA_DIR/uploads. Files live outside /public and
 * are only served through /api/uploads/[id] after the ID is validated, so no
 * arbitrary local path is ever exposed.
 */
export class LocalImageStorage implements ImageStorage {
  readonly kind = "local-disk";
  private readonly meta: JsonDocumentStore<StoredImage>;

  constructor(private readonly directory: string) {
    this.meta = new JsonDocumentStore<StoredImage>(path.join(directory, "meta"));
  }

  private binaryPath(image: Pick<StoredImage, "id" | "mimeType">): string {
    return path.join(this.directory, "files", `${image.id}.${EXTENSIONS[image.mimeType]}`);
  }

  async save(bytes: Uint8Array): Promise<StoredImage> {
    const validated = validateImageBytes(bytes);
    const image: StoredImage = {
      id: randomUUID(),
      ...validated,
      createdAt: new Date().toISOString(),
    };
    try {
      await fs.mkdir(path.join(this.directory, "files"), { recursive: true });
      await fs.writeFile(this.binaryPath(image), bytes);
      await this.meta.put(image);
    } catch (error) {
      throw new AppError("STORAGE_ERROR", "Could not save the image. Please try again.", { cause: error });
    }
    return image;
  }

  async get(id: string): Promise<StoredImage | null> {
    if (!UUID_V4_PATTERN.test(id)) return null;
    return this.meta.get(id);
  }

  async read(id: string) {
    const image = await this.get(id);
    if (!image) return null;
    try {
      const bytes = await fs.readFile(this.binaryPath(image));
      return { image, bytes };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}

let storage: ImageStorage | undefined;

export function getImageStorage(): ImageStorage {
  storage ??= new LocalImageStorage(path.join(getEnv().dataDir, "uploads"));
  return storage;
}
