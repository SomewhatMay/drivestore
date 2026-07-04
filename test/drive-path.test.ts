import { describe, it, expect } from "vitest";
import {
  splitPath,
  resolveRootFolder,
  resolveFolderChain,
  createFolderCache,
} from "../src/drive-path";
import {
  createFolder,
  deleteById,
  findChild,
  FOLDER_MIME,
} from "../src/drive-api";
import { createContext } from "../src/request";
import { DriveError } from "../src/types";
import { getToken } from "./get-token";

function uniqueName(): string {
  return `vitest-path-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ctxFromToken() {
  return createContext({ accessToken: getToken() });
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
    const ctx = ctxFromToken();
    const rootName = uniqueName();

    const id = await resolveRootFolder(ctx, rootName, null);
    try {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    } finally {
      await deleteById(ctx, id);
    }
  });

  it("returns the same ID on a second call (skips network via cache)", async () => {
    const ctx = ctxFromToken();
    const rootName = uniqueName();

    const id1 = await resolveRootFolder(ctx, rootName, null);
    try {
      // Pass the cached ID; should skip Drive and return immediately
      const id2 = await resolveRootFolder(ctx, rootName, id1);
      expect(id2).toBe(id1);
    } finally {
      await deleteById(ctx, id1);
    }
  });

  it("re-uses an existing root folder rather than creating a duplicate", async () => {
    const ctx = ctxFromToken();
    const rootName = uniqueName();

    const id1 = await resolveRootFolder(ctx, rootName, null);
    try {
      const id2 = await resolveRootFolder(ctx, rootName, null);
      expect(id2).toBe(id1);
    } finally {
      await deleteById(ctx, id1);
    }
  });
});

describe("resolveFolderChain — integration", () => {
  it("returns rootId immediately for an empty segment list", async () => {
    const ctx = ctxFromToken();
    const rootId = await createFolder(ctx, "appDataFolder", uniqueName());
    const cache = createFolderCache();

    try {
      const result = await resolveFolderChain(ctx, rootId, [], false, cache);
      expect(result).toBe(rootId);
    } finally {
      await deleteById(ctx, rootId);
    }
  });

  it("creates nested folders when createMissing is true", async () => {
    const ctx = ctxFromToken();
    const rootId = await createFolder(ctx, "appDataFolder", uniqueName());
    const cache = createFolderCache();
    const seg1 = uniqueName();
    const seg2 = uniqueName();

    try {
      const leafId = await resolveFolderChain(
        ctx,
        rootId,
        [seg1, seg2],
        true,
        cache
      );
      expect(typeof leafId).toBe("string");

      // Verify hierarchy exists
      const child1 = await findChild(ctx, rootId, seg1, FOLDER_MIME);
      expect(child1).not.toBeNull();
      const child2 = await findChild(ctx, child1!.id, seg2, FOLDER_MIME);
      expect(child2).not.toBeNull();
      expect(child2!.id).toBe(leafId);
    } finally {
      await deleteById(ctx, rootId);
    }
  });

  it("throws DriveError (404) when folder is missing and createMissing is false", async () => {
    const ctx = ctxFromToken();
    const rootId = await createFolder(ctx, "appDataFolder", uniqueName());
    const cache = createFolderCache();

    try {
      await expect(
        resolveFolderChain(ctx, rootId, ["does-not-exist"], false, cache)
      ).rejects.toThrow(DriveError);
    } finally {
      await deleteById(ctx, rootId);
    }
  });

  it("populates the folder cache and avoids re-traversal", async () => {
    const ctx = ctxFromToken();
    const rootId = await createFolder(ctx, "appDataFolder", uniqueName());
    const cache = createFolderCache();
    const seg = uniqueName();

    try {
      const id1 = await resolveFolderChain(ctx, rootId, [seg], true, cache);
      expect(cache.resolved.size).toBe(1);

      // Second call — should use cache (still returns same ID)
      const id2 = await resolveFolderChain(ctx, rootId, [seg], false, cache);
      expect(id2).toBe(id1);
    } finally {
      await deleteById(ctx, rootId);
    }
  });
});
