import { describe, it, expect } from "vitest";
import { createDriveStore } from "../src/drive-store";
import { DriveError } from "../src/types";
import { getToken } from "./get-token";

function uniqueRoot(): string {
  return `vitest-drivestore-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

describe("DriveStore", () => {
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

  it("append creates file if it does not exist", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.append("new.txt", "hello");
    expect(await store.read("new.txt")).toBe("hello");
  });

  it("throws DriveError when reading non-existent file", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await expect(store.read("missing.txt")).rejects.toThrow(DriveError);
  });

  it("exists returns false for missing file", async () => {
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

  it("second write to same path reuses cached folder", async () => {
    const store = createDriveStore({
      accessToken: getToken(),
      rootName: uniqueRoot(),
    });
    await store.write("folder/a.txt", "first");
    await store.write("folder/b.txt", "second"); // should hit folder cache
    expect(await store.read("folder/a.txt")).toBe("first");
    expect(await store.read("folder/b.txt")).toBe("second");
  });

  it("accepts an async token function", async () => {
    const store = createDriveStore({
      accessToken: () => Promise.resolve(getToken()),
      rootName: uniqueRoot(),
    });
    await store.write("token-fn.txt", "ok");
    expect(await store.read("token-fn.txt")).toBe("ok");
  });
});
