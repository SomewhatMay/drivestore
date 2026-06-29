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

  // Binary

  it("writeBytes / readBytes round-trip arbitrary binary", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    const data = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    await store.writeBytes("blobs/data.bin", data);
    const out = await store.readBytes("blobs/data.bin");
    expect(Array.from(out)).toEqual(Array.from(data));
  });

  it("overwrites binary content on a second writeBytes", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.writeBytes("b.bin", new Uint8Array([1, 1, 1]));
    await store.writeBytes("b.bin", new Uint8Array([9, 8, 7]));
    expect(Array.from(await store.readBytes("b.bin"))).toEqual([9, 8, 7]);
  });

  it("exists and delete work on binary files too", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.writeBytes("bin/x.bin", new Uint8Array([42]));
    expect(await store.exists("bin/x.bin")).toBe(true);
    await store.delete("bin/x.bin");
    expect(await store.exists("bin/x.bin")).toBe(false);
  });

  // List

  it("lists files and sub-folders in a directory", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("dir/a.txt", "1");
    await store.write("dir/b.txt", "2");
    await store.write("dir/sub/c.txt", "3");

    const entries = await store.list("dir");
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.type]));
    expect(byName["a.txt"]).toBe("file");
    expect(byName["b.txt"]).toBe("file");
    expect(byName["sub"]).toBe("directory");
  });

  it("lists the store root for an empty path", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("root-level.txt", "hi");
    const entries = await store.list("");
    expect(entries.some((e) => e.name === "root-level.txt")).toBe(true);
  });

  it("throws DriveError (404) when listing a missing directory", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await expect(store.list("nope/missing")).rejects.toThrow(DriveError);
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
