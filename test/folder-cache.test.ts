import { describe, it, expect, vi } from "vitest";
import { createFolderCache, resolveFolderChain } from "../src/drive-path";
import { createContext } from "../src/request";
import { createDriveStore } from "../src/drive-store";
import { FOLDER_MIME } from "../src/drive-api";

// Pure unit tests — an injected fetch simulates Drive so no network is hit.

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolveFolderChain — concurrency", () => {
  it("creates a missing folder only once under concurrent resolution", async () => {
    let createCalls = 0;
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      // createFolder issues a POST to /files; list queries are GETs.
      if (init?.method === "POST") {
        createCalls++;
        return Promise.resolve(jsonResponse({ id: "folder-new" }));
      }
      return Promise.resolve(jsonResponse({ files: [] }));
    });

    const ctx = createContext({ accessToken: "t", fetch: fetchImpl as never });
    const cache = createFolderCache();

    const [a, b] = await Promise.all([
      resolveFolderChain(ctx, "root", ["x"], true, cache),
      resolveFolderChain(ctx, "root", ["x"], true, cache),
    ]);

    expect(a).toBe("folder-new");
    expect(b).toBe("folder-new");
    // Without dedupe this would be 2 — the bug the fix addresses.
    expect(createCalls).toBe(1);
    expect(cache.resolved.get("root/x")).toBe("folder-new");
    expect(cache.pending.size).toBe(0);
  });

  it("clears the pending entry when creation fails so it can be retried", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        attempt++;
        if (attempt === 1) {
          return Promise.resolve(new Response("boom", { status: 403 }));
        }
        return Promise.resolve(jsonResponse({ id: "folder-2" }));
      }
      return Promise.resolve(jsonResponse({ files: [] }));
    });

    const ctx = createContext({
      accessToken: "t",
      fetch: fetchImpl as never,
      maxRetries: 0,
    });
    const cache = createFolderCache();

    await expect(
      resolveFolderChain(ctx, "root", ["x"], true, cache)
    ).rejects.toThrow();
    expect(cache.pending.size).toBe(0);

    // Second attempt succeeds now that the failed pending entry was cleared.
    const id = await resolveFolderChain(ctx, "root", ["x"], true, cache);
    expect(id).toBe("folder-2");
  });
});

describe("DriveStore — root folder concurrency", () => {
  it("creates the root folder only once under concurrent first writes", async () => {
    let rootCreates = 0;
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      // Root (and any folder) creation: POST to the metadata /files endpoint.
      if (method === "POST" && url.includes("/drive/v3/files?fields=id")) {
        const meta = JSON.parse(String(init?.body)) as {
          parents?: string[];
          mimeType?: string;
        };
        if (meta.parents?.[0] === "appDataFolder" && meta.mimeType === FOLDER_MIME) {
          rootCreates++;
        }
        return Promise.resolve(jsonResponse({ id: `folder-${rootCreates}` }));
      }
      // File creation via multipart upload.
      if (method === "POST" && url.includes("uploadType=multipart")) {
        return Promise.resolve(jsonResponse({ id: "file" }));
      }
      // All list lookups: nothing exists yet.
      return Promise.resolve(jsonResponse({ files: [] }));
    });

    const store = createDriveStore({
      accessToken: "t",
      rootName: "app",
      fetch: fetchImpl as never,
    });

    await Promise.all([store.write("a.txt", "1"), store.write("b.txt", "2")]);

    // Without the in-flight root dedupe this would be 2 (duplicate roots).
    expect(rootCreates).toBe(1);
  });
});
