import "server-only";

import mongoose from "mongoose";

import { AppError } from "@/lib/errors";

interface MongooseCache {
  promise?: Promise<typeof mongoose>;
}

const globalForMongoose = globalThis as typeof globalThis & { __alfaMongoose?: MongooseCache };
const cache: MongooseCache = (globalForMongoose.__alfaMongoose ??= {});

/** Single shared connection, reused across hot reloads in development. */
export async function connectMongo(uri: string): Promise<typeof mongoose> {
  cache.promise ??= mongoose
    .connect(uri, { serverSelectionTimeoutMS: 5_000, bufferCommands: false })
    .catch((error: unknown) => {
      cache.promise = undefined;
      throw new AppError("STORAGE_ERROR", "Could not connect to MongoDB. Check MONGODB_URI.", { cause: error });
    });
  return cache.promise;
}
