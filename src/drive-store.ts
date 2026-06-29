import {
  createTextFile,
  deleteById,
  findChild,
  readTextById,
  updateTextById,
} from "./drive-api";
import {
  createFolderCache,
  resolveFolderChain,
  resolveRootFolder,
  splitPath,
} from "./drive-path";
import { createContext } from "./request";
import { DriveError, DriveFile, DriveStore, DriveStoreOptions } from "./types";

export function createDriveStore(options: DriveStoreOptions): DriveStore {
  const ctx = createContext(options);
  const rootName = options.rootName ?? "drive-store";

  let cachedRootId: string | null = null;
  // Caches resolved folder IDs (and dedupes concurrent folder creation)
  const folderCache = createFolderCache();

  async function getRootId(): Promise<string> {
    cachedRootId = await resolveRootFolder(ctx, rootName, cachedRootId);
    return cachedRootId;
  }

  /**
   * Resolves all path segments and returns the containing folder ID,
   * the file name, and the existing DriveFile (or null).
   */
  async function resolveFilePath(
    parts: string[],
    createFolders: boolean
  ): Promise<{ folderId: string; fileName: string; file: DriveFile | null }> {
    const rootId = await getRootId();
    const folderId = await resolveFolderChain(
      ctx,
      rootId,
      parts.slice(0, -1),
      createFolders,
      folderCache
    );
    const fileName = parts[parts.length - 1];
    const file = await findChild(ctx, folderId, fileName, "text/plain");
    return { folderId, fileName, file };
  }

  return {
    async read(path: string): Promise<string> {
      if (!path) throw new Error("Path is empty");
      const parts = splitPath(path);
      const { file } = await resolveFilePath(parts, false);
      if (!file) throw new DriveError(`File not found: "${path}"`, 404);
      return readTextById(ctx, file.id);
    },

    async write(path: string, content: string): Promise<void> {
      if (!path) throw new Error("Path is empty");
      const parts = splitPath(path);
      const { folderId, fileName, file } = await resolveFilePath(parts, true);

      if (file) {
        await updateTextById(ctx, file.id, content);
      } else {
        await createTextFile(ctx, folderId, fileName, content);
      }
    },

    async append(path: string, newContent: string): Promise<void> {
      if (!path) throw new Error("Path is empty");
      const parts = splitPath(path);
      const { folderId, fileName, file } = await resolveFilePath(parts, true);

      if (!file) {
        await createTextFile(ctx, folderId, fileName, newContent);
        return;
      }

      // NOTE: read-then-write is not atomic. Retries/refresh do not make this
      // safe — concurrent appends (e.g. multiple tabs or processes sharing the
      // same account) may interleave or lose data. Serialize at the app level.
      const current = await readTextById(ctx, file.id);
      await updateTextById(ctx, file.id, current + newContent);
    },

    async exists(path: string): Promise<boolean> {
      if (!path) throw new Error("Path is empty");
      const parts = splitPath(path);
      try {
        const { file } = await resolveFilePath(parts, false);
        return file !== null;
      } catch (err) {
        // A missing folder also means the file doesn't exist
        if (err instanceof DriveError && err.status === 404) return false;
        throw err;
      }
    },

    async delete(path: string): Promise<void> {
      if (!path) throw new Error("Path is empty");
      const parts = splitPath(path);
      const { file } = await resolveFilePath(parts, false);
      if (!file) throw new DriveError(`File not found: "${path}"`, 404);
      await deleteById(ctx, file.id);
    },
  };
}
