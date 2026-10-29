import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * A tiny document store backed by one JSON file per record.
 *
 * Why not an in-memory Map: Next.js may serve route handlers from different
 * workers/processes (and dev mode reloads modules), so memory is not shared
 * between the request that creates a task and the requests that poll it.
 *
 * Why one file per record: writes to different records never contend, and
 * each write is atomic (write temp file → rename), so a concurrent reader in
 * another process sees either the old or the new document, never a torn one.
 */
export class JsonDocumentStore<T extends { id: string }> {
  constructor(private readonly directory: string) {}

  private static readonly ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

  private filePath(id: string): string {
    if (!JsonDocumentStore.ID_PATTERN.test(id)) {
      throw new Error("Invalid document id");
    }
    return path.join(this.directory, `${id}.json`);
  }

  async get(id: string): Promise<T | null> {
    if (!JsonDocumentStore.ID_PATTERN.test(id)) return null;
    try {
      const raw = await fs.readFile(this.filePath(id), "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async put(doc: T): Promise<T> {
    await fs.mkdir(this.directory, { recursive: true });
    const target = this.filePath(doc.id);
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(doc, null, 2), "utf8");
    await fs.rename(temp, target);
    return doc;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.filePath(id));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async list(): Promise<T[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.directory);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const docs: (T | null)[] = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => this.get(name.slice(0, -".json".length)).catch((): T | null => null)),
    );
    return docs.filter((doc): doc is T => doc !== null);
  }
}

export function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
