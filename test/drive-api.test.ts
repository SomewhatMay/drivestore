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
import { createContext } from "../src/request";
import { DriveError } from "../src/types";
import { getToken } from "./get-token";

function uniqueName(): string {
  return `vitest-api-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ctxFromToken() {
  return createContext({ accessToken: getToken() });
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
    const ctx = ctxFromToken();
    const files = await listAll(
      ctx,
      `name = '${uniqueName()}' and trashed = false`
    );
    expect(Array.isArray(files)).toBe(true);
  });

  it("findChild returns null for a non-existent name", async () => {
    const ctx = ctxFromToken();
    const result = await findChild(ctx, "appDataFolder", uniqueName());
    expect(result).toBeNull();
  });

  it("createFolder, findChild, and deleteById round-trip", async () => {
    const ctx = ctxFromToken();
    const name = uniqueName();

    const id = await createFolder(ctx, "appDataFolder", name);
    try {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);

      const found = await findChild(ctx, "appDataFolder", name, FOLDER_MIME);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(id);

      await deleteById(ctx, id);

      const gone = await findChild(ctx, "appDataFolder", name, FOLDER_MIME);
      expect(gone).toBeNull();
    } finally {
      // Safety net if an assertion above threw before the explicit delete.
      await deleteById(ctx, id);
    }
  });

  it("createTextFile, readTextById, updateTextById, deleteById round-trip", async () => {
    const ctx = ctxFromToken();
    const folderId = await createFolder(ctx, "appDataFolder", uniqueName());

    try {
      const fileId = await createTextFile(ctx, folderId, "data.txt", "hello");
      expect(typeof fileId).toBe("string");

      const content = await readTextById(ctx, fileId);
      expect(content).toBe("hello");

      await updateTextById(ctx, fileId, "world");
      const updated = await readTextById(ctx, fileId);
      expect(updated).toBe("world");

      await deleteById(ctx, fileId);
      // Verify the file is truly gone
      const gone = await findChild(ctx, folderId, "data.txt", "text/plain");
      expect(gone).toBeNull();
    } finally {
      // Clean up the folder regardless of test outcome
      await deleteById(ctx, folderId);
    }
  });

  it("deleteById is idempotent on a missing file (no throw on 404)", async () => {
    const ctx = ctxFromToken();
    // A well-formed but non-existent Drive ID; Drive returns 404 which should be swallowed
    await expect(
      deleteById(ctx, "nonexistent_file_id_xyz")
    ).resolves.toBeUndefined();
  });

  it("readTextById throws DriveError on missing file", async () => {
    const ctx = ctxFromToken();
    await expect(
      readTextById(ctx, "nonexistent_file_id_xyz")
    ).rejects.toThrow(DriveError);
  });
});
