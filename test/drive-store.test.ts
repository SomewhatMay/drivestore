import { describe, it, expect } from "vitest";
import { createDriveStore } from "../src/drive-store";
import { DriveError } from "../src/types";
import { getToken } from "./get-token";

function uniqueRoot(): string {
  return `vitest-store-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("DriveStore", () => {
  // Core read / write

  it("writes and reads a file", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("a/b/c.txt", "hello");
    expect(await store.read("a/b/c.txt")).toBe("hello");
  });

  it("creates nested folders automatically", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("deep/nested/structure/file.txt", "data");
    expect(await store.read("deep/nested/structure/file.txt")).toBe("data");
  });

  it("overwrites existing file on write", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("file.txt", "first");
    await store.write("file.txt", "second");
    expect(await store.read("file.txt")).toBe("second");
  });

  it("throws DriveError (404) when reading non-existent file", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    const err = await store.read("missing.txt").catch((e) => e);
    expect(err).toBeInstanceOf(DriveError);
    expect((err as DriveError).status).toBe(404);
  });

  // Append

  it("appends correctly", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("log.txt", "a");
    await store.append("log.txt", "b");
    await store.append("log.txt", "c");
    expect(await store.read("log.txt")).toBe("abc");
  });

  it("append creates the file if it does not exist", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.append("new.txt", "hello");
    expect(await store.read("new.txt")).toBe("hello");
  });

  // Exists

  it("exists returns false for a missing file", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    expect(await store.exists("ghost.txt")).toBe(false);
  });

  it("exists returns true after writing", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("present.txt", "yes");
    expect(await store.exists("present.txt")).toBe(true);
  });

  it("exists returns false when an intermediate folder is also missing", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    expect(await store.exists("no/such/folder/file.txt")).toBe(false);
  });

  // Delete

  it("delete removes the file", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("to-delete.txt", "bye");
    await store.delete("to-delete.txt");
    expect(await store.exists("to-delete.txt")).toBe(false);
  });

  it("delete throws DriveError when file is missing", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await expect(store.delete("no-such-file.txt")).rejects.toThrow(DriveError);
  });

  // Folder cache

  it("second write to the same folder reuses cached folder ID", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("shared/a.txt", "first");
    await store.write("shared/b.txt", "second"); // should hit folder cache
    expect(await store.read("shared/a.txt")).toBe("first");
    expect(await store.read("shared/b.txt")).toBe("second");
  });

  // Token function

  it("accepts an async token function", async () => {
    const store = createDriveStore({
      accessToken: () => Promise.resolve(getToken()),
      rootName: uniqueRoot(),
    });
    await store.write("token-fn.txt", "ok");
    expect(await store.read("token-fn.txt")).toBe("ok");
  });

  // Root folder caching

  it("multiple operations reuse the same root folder (cachedRootId)", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    // Write twice - second call should not re-create the root folder
    await store.write("x.txt", "1");
    await store.write("y.txt", "2");
    expect(await store.read("x.txt")).toBe("1");
    expect(await store.read("y.txt")).toBe("2");
  });
});
