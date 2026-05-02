import { describe, it, expect } from "vitest";
import {
  splitPath,
  resolveRootFolder,
  resolveFolderChain,
} from "../src/drive-path";
import {
  createFolder,
  deleteById,
  findChild,
  FOLDER_MIME,
} from "../src/drive-api";
import { DriveError } from "../src/types";
import { getToken } from "./get-token";

function uniqueName(): string {
  return `vitest-path-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Pure unit tests (no network)

describe("splitPath", () => {
  it("splits a simple path", () => {
    expect(splitPath("a/b/c.txt")).toEqual(["a", "b", "c.txt"]);
  });

  it("trims whitespace from each segment", () => {
    expect(splitPath(" a / b / c.txt ")).toEqual(["a", "b", "c.txt"]);
  });

  it("filters empty segments from leading or double slashes", () => {
    expect(splitPath("/a//b/")).toEqual(["a", "b"]);
  });

  it("returns a single element for a flat file name", () => {
    expect(splitPath("file.txt")).toEqual(["file.txt"]);
  });

  it("returns an empty array for a blank path", () => {
    expect(splitPath("")).toEqual([]);
    expect(splitPath("  /  /  ")).toEqual([]);
  });
});

// Integration tests (require GOOGLE_ACCESS_TOKEN)

describe("resolveRootFolder — integration", () => {
  it("creates the root folder when it does not exist", async () => {
    const token = getToken();
    const rootName = uniqueName();

    const id = await resolveRootFolder(rootName, token, null);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    // Clean up
    await deleteById(id, token);
  });

  it("returns the same ID on a second call (skips network via cache)", async () => {
    const token = getToken();
    const rootName = uniqueName();

    const id1 = await resolveRootFolder(rootName, token, null);
    // Pass the cached ID; should skip Drive and return immediately
    const id2 = await resolveRootFolder(rootName, token, id1);
    expect(id2).toBe(id1);

    await deleteById(id1, token);
  });

  it("re-uses an existing root folder rather than creating a duplicate", async () => {
    const token = getToken();
    const rootName = uniqueName();

    const id1 = await resolveRootFolder(rootName, token, null);
    const id2 = await resolveRootFolder(rootName, token, null);
    expect(id2).toBe(id1);

    await deleteById(id1, token);
  });
});

describe("resolveFolderChain — integration", () => {
  it("returns rootId immediately for an empty segment list", async () => {
    const token = getToken();
    const rootId = await createFolder("appDataFolder", uniqueName(), token);
    const cache = new Map<string, string>();

    try {
      const result = await resolveFolderChain(rootId, [], token, false, cache);
      expect(result).toBe(rootId);
    } finally {
      await deleteById(rootId, token);
    }
  });

  it("creates nested folders when createMissing is true", async () => {
    const token = getToken();
    const rootId = await createFolder("appDataFolder", uniqueName(), token);
    const cache = new Map<string, string>();
    const seg1 = uniqueName();
    const seg2 = uniqueName();

    try {
      const leafId = await resolveFolderChain(
        rootId,
        [seg1, seg2],
        token,
        true,
        cache
      );
      expect(typeof leafId).toBe("string");

      // Verify hierarchy exists
      const child1 = await findChild(rootId, seg1, token, FOLDER_MIME);
      expect(child1).not.toBeNull();
      const child2 = await findChild(child1!.id, seg2, token, FOLDER_MIME);
      expect(child2).not.toBeNull();
      expect(child2!.id).toBe(leafId);
    } finally {
      await deleteById(rootId, token);
    }
  });

  it("throws DriveError (404) when folder is missing and createMissing is false", async () => {
    const token = getToken();
    const rootId = await createFolder("appDataFolder", uniqueName(), token);
    const cache = new Map<string, string>();

    try {
      await expect(
        resolveFolderChain(rootId, ["does-not-exist"], token, false, cache)
      ).rejects.toThrow(DriveError);
    } finally {
      await deleteById(rootId, token);
    }
  });

  it("populates the folder cache and avoids re-traversal", async () => {
    const token = getToken();
    const rootId = await createFolder("appDataFolder", uniqueName(), token);
    const cache = new Map<string, string>();
    const seg = uniqueName();

    try {
      const id1 = await resolveFolderChain(rootId, [seg], token, true, cache);
      expect(cache.size).toBe(1);

      // Second call — should use cache (still returns same ID)
      const id2 = await resolveFolderChain(rootId, [seg], token, false, cache);
      expect(id2).toBe(id1);
    } finally {
      await deleteById(rootId, token);
    }
  });
});
