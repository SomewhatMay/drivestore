import {
  createBinaryFile,
  createTextFile,
  deleteById,
  findChildFile,
  FOLDER_MIME,
  listChildren,
  readBytesById,
  readTextById,
  updateBytesById,
  updateTextById,
} from "./drive-api";
import {
  createFolderCache,
  resolveFolderChain,
  resolveRootFolder,
  splitPath,
} from "./drive-path";
import { createContext } from "./request";
import {
  DriveEntry,
  DriveError,
  DriveFile,
  DriveStore,
  DriveStoreOptions,
} from "./types";

export function createDriveStore(options: DriveStoreOptions): DriveStore {
  const ctx = createContext(options);
  const rootName = options.rootName ?? "drive-store";

  let cachedRootId: string | null = null;
  // Dedupes the in-flight root resolution so concurrent first operations don't
  // each create a duplicate root folder (the same race the folderCache fixes
  // for sub-folders).
  let rootIdPromise: Promise<string> | null = null;
  // Caches resolved folder IDs (and dedupes concurrent folder creation)
  const folderCache = createFolderCache();

  async function getRootId(): Promise<string> {
    if (cachedRootId) return cachedRootId;
    if (!rootIdPromise) {
      rootIdPromise = resolveRootFolder(ctx, rootName, cachedRootId)
        .then((id) => {
          cachedRootId = id;
          rootIdPromise = null;
          return id;
        })
        .catch((err) => {
          rootIdPromise = null;
          throw err;
        });
    }
    return rootIdPromise;
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
    // Match the leaf by name regardless of MIME so text and binary files are
    // both resolvable (the leaf is any non-folder child with this name).
    const file = await findChildFile(ctx, folderId, fileName);
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

    async readBytes(path: string): Promise<Uint8Array> {
      if (!path) throw new Error("Path is empty");
      const parts = splitPath(path);
      const { file } = await resolveFilePath(parts, false);
      if (!file) throw new DriveError(`File not found: "${path}"`, 404);
      return readBytesById(ctx, file.id);
    },

    async writeBytes(path: string, data: Uint8Array): Promise<void> {
      if (!path) throw new Error("Path is empty");
      const parts = splitPath(path);
      const { folderId, fileName, file } = await resolveFilePath(parts, true);

      if (file) {
        await updateBytesById(ctx, file.id, data);
      } else {
        await createBinaryFile(ctx, folderId, fileName, data);
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

    async list(path: string): Promise<DriveEntry[]> {
      // An empty path lists the store root; otherwise every segment is a folder.
      const parts = splitPath(path);
      const rootId = await getRootId();
      const folderId = await resolveFolderChain(
        ctx,
        rootId,
        parts,
        false,
        folderCache
      );
      const children = await listChildren(ctx, folderId);
      return children.map((child) => ({
        name: child.name,
        type: child.mimeType === FOLDER_MIME ? "directory" : "file",
      }));
    },
  };
}
