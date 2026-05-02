import {
  createTextFile,
  deleteById,
  findChild,
  readTextById,
  updateTextById,
} from "./drive-api";
import { resolveFolderChain, resolveRootFolder, splitPath } from "./drive-path";
import { DriveError, DriveFile, DriveStore, DriveStoreOptions } from "./types";

export function createDriveStore(options: DriveStoreOptions): DriveStore {
  const getAccessToken: () => Promise<string> =
    typeof options.accessToken === "string"
      ? () => Promise.resolve(options.accessToken as string)
      : options.accessToken;

  const rootName = options.rootName ?? "drive-store";

  let cachedRootId: string | null = null;
  // Caches resolved "parentId/folderName" → folderId to avoid redundant traversals
  const folderCache = new Map<string, string>();

  async function getRootId(): Promise<string> {
    const accessToken = await getAccessToken();
    cachedRootId = await resolveRootFolder(rootName, accessToken, cachedRootId);
    return cachedRootId;
  }

  /**
   * Resolves all path segments and returns the containing folder ID,
   * the file name, and the existing DriveFile (or null).
   */
  async function resolveFilePath(
    parts: string[],
    accessToken: string,
    createFolders: boolean
  ): Promise<{ folderId: string; fileName: string; file: DriveFile | null }> {
    const rootId = await getRootId();
    const folderId = await resolveFolderChain(
      rootId,
      parts.slice(0, -1),
      accessToken,
      createFolders,
      folderCache
    );
    const fileName = parts[parts.length - 1];
    const file = await findChild(folderId, fileName, accessToken, "text/plain");
    return { folderId, fileName, file };
  }

  return {
    async read(path: string): Promise<string> {
      if (!path) throw new Error("Path is empty");
      const accessToken = await getAccessToken();
      const parts = splitPath(path);
      const { file } = await resolveFilePath(parts, accessToken, false);
      if (!file) throw new DriveError(`File not found: "${path}"`, 404);
      return readTextById(file.id, accessToken);
    },

    async write(path: string, content: string): Promise<void> {
      if (!path) throw new Error("Path is empty");
      const accessToken = await getAccessToken();
      const parts = splitPath(path);
      const { folderId, fileName, file } = await resolveFilePath(
        parts,
        accessToken,
        true
      );

      if (file) {
        await updateTextById(file.id, content, accessToken);
      } else {
        await createTextFile(folderId, fileName, content, accessToken);
      }
    },

    async append(path: string, newContent: string): Promise<void> {
      if (!path) throw new Error("Path is empty");
      const accessToken = await getAccessToken();
      const parts = splitPath(path);
      const { folderId, fileName, file } = await resolveFilePath(
        parts,
        accessToken,
        true
      );

      if (!file) {
        await createTextFile(folderId, fileName, newContent, accessToken);
        return;
      }

      // NOTE: read-then-write is not atomic; concurrent appends may lose data.
      const current = await readTextById(file.id, accessToken);
      await updateTextById(file.id, current + newContent, accessToken);
    },

    async exists(path: string): Promise<boolean> {
      if (!path) throw new Error("Path is empty");
      const accessToken = await getAccessToken();
      const parts = splitPath(path);
      try {
        const { file } = await resolveFilePath(parts, accessToken, false);
        return file !== null;
      } catch (err) {
        // A missing folder also means the file doesn't exist
        if (err instanceof DriveError && err.status === 404) return false;
        throw err;
      }
    },

    async delete(path: string): Promise<void> {
      if (!path) throw new Error("Path is empty");
      const accessToken = await getAccessToken();
      const parts = splitPath(path);
      const { file } = await resolveFilePath(parts, accessToken, false);
      if (!file) throw new DriveError(`File not found: "${path}"`, 404);
      await deleteById(file.id, accessToken);
    },
  };
}
