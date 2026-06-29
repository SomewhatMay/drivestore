import { createFolder, findChild, FOLDER_MIME } from "./drive-api";
import { DriveContext } from "./request";
import { DriveError } from "./types";

export function splitPath(path: string): string[] {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
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

/**
 * Walks (and optionally creates) a chain of sub-folders under `rootId`.
 * Uses `folderCache` to skip redundant Drive API calls on repeated traversals.
 */
export async function resolveFolderChain(
  ctx: DriveContext,
  rootId: string,
  segments: string[],
  createMissing: boolean,
  folderCache: Map<string, string>
): Promise<string> {
  let parent = rootId;

  for (const segment of segments) {
    const cacheKey = `${parent}/${segment}`;
    const cached = folderCache.get(cacheKey);

    if (cached) {
      parent = cached;
      continue;
    }

    const existing = await findChild(ctx, parent, segment, FOLDER_MIME);

    if (existing) {
      folderCache.set(cacheKey, existing.id);
      parent = existing.id;
      continue;
    }

    if (!createMissing) {
      throw new DriveError(`Folder not found: "${segment}"`, 404);
    }

    const newId = await createFolder(ctx, parent, segment);
    folderCache.set(cacheKey, newId);
    parent = newId;
  }

  return parent;
}
