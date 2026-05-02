import { describe, it, expect } from "vitest";
import {
  escapeQueryValue,
  listAll,
  findChild,
  createFolder,
  createTextFile,
  readTextById,
  updateTextById,
  deleteById,
  FOLDER_MIME,
} from "../src/drive-api";
import { DriveError } from "../src/types";
import { getToken } from "./get-token";

function uniqueName(): string {
  return `vitest-api-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Pure unit tests (no network)

describe("escapeQueryValue", () => {
  it("escapes single quotes", () => {
    expect(escapeQueryValue("it's")).toBe("it\\'s");
  });

  it("escapes backslashes", () => {
    expect(escapeQueryValue("a\\b")).toBe("a\\\\b");
  });

  it("leaves plain strings unchanged", () => {
    expect(escapeQueryValue("hello world")).toBe("hello world");
  });
});

// Integration tests (require GOOGLE_ACCESS_TOKEN)

describe("Drive API — integration", () => {
  it("listAll returns an array (may be empty)", async () => {
    const token = getToken();
    const files = await listAll(
      `name = '${uniqueName()}' and trashed = false`,
      token
    );
    expect(Array.isArray(files)).toBe(true);
  });

  it("findChild returns null for a non-existent name", async () => {
    const token = getToken();
    const result = await findChild("appDataFolder", uniqueName(), token);
    expect(result).toBeNull();
  });

  it("createFolder, findChild, and deleteById round-trip", async () => {
    const token = getToken();
    const name = uniqueName();

    const id = await createFolder("appDataFolder", name, token);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const found = await findChild("appDataFolder", name, token, FOLDER_MIME);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(id);

    await deleteById(id, token);

    const gone = await findChild("appDataFolder", name, token, FOLDER_MIME);
    expect(gone).toBeNull();
  });

  it("createTextFile, readTextById, updateTextById, deleteById round-trip", async () => {
    const token = getToken();
    const folderId = await createFolder("appDataFolder", uniqueName(), token);

    try {
      const fileId = await createTextFile(folderId, "data.txt", "hello", token);
      expect(typeof fileId).toBe("string");

      const content = await readTextById(fileId, token);
      expect(content).toBe("hello");

      await updateTextById(fileId, "world", token);
      const updated = await readTextById(fileId, token);
      expect(updated).toBe("world");

      await deleteById(fileId, token);
      // Verify the file is truly gone
      const gone = await findChild(folderId, "data.txt", token, "text/plain");
      expect(gone).toBeNull();
    } finally {
      // Clean up the folder regardless of test outcome
      await deleteById(folderId, token);
    }
  });

  it("deleteById is idempotent on a missing file (no throw on 404)", async () => {
    const token = getToken();
    // A well-formed but non-existent Drive ID; Drive returns 404 which should be swallowed
    await expect(
      deleteById("nonexistent_file_id_xyz", token)
    ).resolves.toBeUndefined();
  });

  it("readTextById throws DriveError on missing file", async () => {
    const token = getToken();
    await expect(
      readTextById("nonexistent_file_id_xyz", token)
    ).rejects.toThrow(DriveError);
  });
});
