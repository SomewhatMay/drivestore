import { describe, it, expect, vi } from "vitest";
import { createDriveStore } from "../src/drive-store";
import { FOLDER_MIME } from "../src/drive-api";
import { DriveError } from "../src/types";

// Pure unit tests — an injected fetch answers Drive list queries by `q`.

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const ROOT = { id: "root", name: "app", mimeType: FOLDER_MIME };
const DIR = { id: "dir", name: "dir", mimeType: FOLDER_MIME };

/**
 * Minimal fake Drive that resolves the root folder, a single sub-folder
 * `dir`, and returns the given children for whichever folder is listed.
 */
function driveStub(rootChildren: unknown[], dirChildren: unknown[]) {
  return vi.fn((url: string) => {
    const q = new URL(url).searchParams.get("q") ?? "";
    const named = q.includes("name =");

    if (q.includes("'appDataFolder' in parents")) {
      return Promise.resolve(jsonResponse({ files: [ROOT] }));
    }
    if (q.includes("'root' in parents") && named) {
      return Promise.resolve(jsonResponse({ files: [DIR] }));
    }
    if (q.includes("'root' in parents")) {
      return Promise.resolve(jsonResponse({ files: rootChildren }));
    }
    if (q.includes("'dir' in parents")) {
      return Promise.resolve(jsonResponse({ files: dirChildren }));
    }
    return Promise.resolve(jsonResponse({ files: [] }));
  });
}

describe("DriveStore.list", () => {
  it("maps children to file/directory entries", async () => {
    const fetch = driveStub(
      [],
      [
        { id: "f1", name: "a.txt", mimeType: "text/plain" },
        { id: "f2", name: "sub", mimeType: FOLDER_MIME },
      ]
    );
    const store = createDriveStore({
      accessToken: "t",
      rootName: "app",
      fetch: fetch as never,
    });

    const entries = await store.list("dir");
    expect(entries).toContainEqual({ name: "a.txt", type: "file" });
    expect(entries).toContainEqual({ name: "sub", type: "directory" });
    expect(entries).toHaveLength(2);
  });

  it("lists the store root for an empty path", async () => {
    const fetch = driveStub(
      [{ id: "r1", name: "top.json", mimeType: "text/plain" }],
      []
    );
    const store = createDriveStore({
      accessToken: "t",
      rootName: "app",
      fetch: fetch as never,
    });

    const entries = await store.list("");
    expect(entries).toEqual([{ name: "top.json", type: "file" }]);
  });

  it("throws DriveError 404 for a missing directory", async () => {
    // Root resolves, but every sub-folder lookup returns empty → resolution fails.
    const fetch = vi.fn((url: string) => {
      const q = new URL(url).searchParams.get("q") ?? "";
      if (q.includes("'appDataFolder' in parents")) {
        return Promise.resolve(jsonResponse({ files: [ROOT] }));
      }
      return Promise.resolve(jsonResponse({ files: [] }));
    });

    const store = createDriveStore({
      accessToken: "t",
      rootName: "app",
      fetch: fetch as never,
    });

    const err = await store.list("missing").catch((e) => e);
    expect(err).toBeInstanceOf(DriveError);
    expect((err as DriveError).status).toBe(404);
  });
});
