import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { put, list } from "@vercel/blob";

const DATA_DIR_NAME = process.env.DATA_DIR_NAME || "data";
// Support absolute paths (e.g., /mnt/tos) for mounted storage
export const DATA_DIR = DATA_DIR_NAME.startsWith("/")
  ? DATA_DIR_NAME
  : path.join(process.cwd(), DATA_DIR_NAME);
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Vercel deployment should use Vercel Blob instead of filesystem writes.
export const isVercelRuntime = Boolean(process.env.VERCEL);
export const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const isCloudStorageEnabled = hasBlobToken;

// Ensure local data directories for non-Vercel / local development.
try {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.warn('[server] Cannot create local data directories (read-only fs?):', (err as Error).message);
}

if (isVercelRuntime && !hasBlobToken) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required on Vercel. Configure it in Project Settings > Environment Variables.");
}

const getDbPath = (collection: string) => path.join(DATA_DIR, `${collection}.json`);

const normalizeCollectionData = (data: unknown) => (Array.isArray(data) ? data : []);

const storageError = (message: string, status: number) => Object.assign(new Error(message), { status });

export const readCollection = async (collection: string) => {
  if (isCloudStorageEnabled) {
    // A failed cloud read must never fall back to an empty local collection:
    // the next write would overwrite the whole collection with partial data.
    try {
      const { blobs } = await list({ prefix: `db/${collection}.json` });
      const exactMatch = blobs.find((b) => b.pathname === `db/${collection}.json`);
      if (exactMatch) {
        const response = await fetch(exactMatch.url);
        if (!response.ok) throw new Error(`Blob fetch returned ${response.status}`);
        const content = await response.text();
        if (content.trim()) {
          return normalizeCollectionData(JSON.parse(content));
        }
      }
      return [];
    } catch (err) {
      console.error(`Error reading Vercel Blob collection ${collection}:`, err);
      throw storageError(`Failed to read collection "${collection}" from cloud storage`, 503);
    }
  }

  try {
    const filePath = getDbPath(collection);
    if (!existsSync(filePath)) return [];
    const content = await fs.readFile(filePath, "utf-8");
    try {
      return normalizeCollectionData(JSON.parse(content));
    } catch (err) {
      if (err instanceof SyntaxError) {
        // A concurrent atomic write may have been mid-rename; retry once.
        await new Promise((resolve) => setTimeout(resolve, 10));
        const retryContent = await fs.readFile(filePath, "utf-8");
        return normalizeCollectionData(JSON.parse(retryContent));
      }
      throw err;
    }
  } catch (err) {
    console.error(`Error reading collection ${collection}:`, err);
    throw storageError(`Failed to read collection "${collection}"`, 500);
  }
};

export const writeCollection = async (collection: string, data: any[]) => {
  if (isCloudStorageEnabled) {
    try {
      await put(`db/${collection}.json`, JSON.stringify(data, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json; charset=utf-8'
      });
    } catch (err) {
      console.error(`Error writing to Vercel Blob collection ${collection}:`, err);
      throw err;
    }
    return;
  }

  if (isVercelRuntime) {
    throw new Error("Filesystem persistence is disabled on Vercel. Configure BLOB_READ_WRITE_TOKEN.");
  }

  const filePath = getDbPath(collection);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
};

const locks = new Map<string, Promise<unknown>>();

// Serialize read-modify-write per collection so concurrent requests cannot
// lose updates. Cross-instance races on Blob remain possible (no ETag support).
export const withCollectionLock = <T>(collection: string, fn: () => Promise<T>): Promise<T> => {
  const prev = locks.get(collection) || Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(collection, run.then(() => undefined, () => undefined));
  return run;
};