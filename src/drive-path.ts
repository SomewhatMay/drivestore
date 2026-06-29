import { createFolder, findChild, FOLDER_MIME } from "./drive-api";
import { DriveContext } from "./request";
import { DriveError } from "./types";

export function splitPath(path: string): string[] {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Per-store folder cache. `resolved` memoizes `parentId/name → folderId`;
 * `pending` deduplicates concurrent *creations* of the same folder so two
 * in-flight writes to a new directory don't each create a duplicate.
 */
export interface FolderCache {
  resolved: Map<string, string>;
  pending: Map<string, Promise<string>>;
}

export function createFolderCache(): FolderCache {
  return { resolved: new Map(), pending: new Map() };
}

export async function resolveRootFolder(
  ctx: DriveContext,
  rootName: string,
  cachedRootId: string | null
): Promise<string> {
  if (cachedRootId) return cachedRootId;

  const existing = await findChild(ctx, "appDataFolder", rootName, FOLDER_MIME);
  if (existing) return existing.id;

  return createFolder(ctx, "appDataFolder", rootName);
}

async function findOrCreateFolder(
  ctx: DriveContext,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await findChild(ctx, parentId, name, FOLDER_MIME);
  if (existing) return existing.id;
  return createFolder(ctx, parentId, name);
}

/**
 * Walks (and optionally creates) a chain of sub-folders under `rootId`.
 * Uses `cache.resolved` to skip redundant Drive API calls on repeated
 * traversals, and `cache.pending` to collapse concurrent creations of the
 * same folder into a single request.
 */
export async function resolveFolderChain(
  ctx: DriveContext,
  rootId: string,
  segments: string[],
  createMissing: boolean,
  cache: FolderCache
): Promise<string> {
  let parent = rootId;

  for (const segment of segments) {
    const cacheKey = `${parent}/${segment}`;
    const cached = cache.resolved.get(cacheKey);

    if (cached) {
      parent = cached;
      continue;
    }

    // Read paths never create, so they can't cause duplicate-folder races —
    // resolve them directly without touching the pending map.
    if (!createMissing) {
      const existing = await findChild(ctx, parent, segment, FOLDER_MIME);
      if (!existing) {
        throw new DriveError(`Folder not found: "${segment}"`, 404);
      }
      cache.resolved.set(cacheKey, existing.id);
      parent = existing.id;
      continue;
    }

    // Creation: dedupe concurrent resolution of the same folder within this
    // store instance so we issue at most one create per folder.
    let inflight = cache.pending.get(cacheKey);
    if (!inflight) {
      inflight = findOrCreateFolder(ctx, parent, segment)
        .then((id) => {
          cache.resolved.set(cacheKey, id);
          cache.pending.delete(cacheKey);
          return id;
        })
        .catch((err) => {
          cache.pending.delete(cacheKey);
          throw err;
        });
      cache.pending.set(cacheKey, inflight);
    }
    parent = await inflight;
  }

  return parent;
}
