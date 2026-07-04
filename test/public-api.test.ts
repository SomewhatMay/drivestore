import { describe, it, expect, vi } from "vitest";
import * as api from "../src/index";
import { createDriveStore, DriveError } from "../src/index";

// The IIFE/global build re-exports exactly this surface, so guarding it here
// guards `window.DriveStore.*` for the <script>-tag distribution too.

describe("public API surface", () => {
  it("exports the factory and error type", () => {
    expect(typeof api.createDriveStore).toBe("function");
    expect(typeof api.DriveError).toBe("function");
  });

  it("DriveError carries status and body and is an Error", () => {
    const err = new DriveError("nope", 404, "body");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.body).toBe("body");
  });

  it("createDriveStore returns a store with the full method set", () => {
    const store = createDriveStore({
      accessToken: "t",
      fetch: vi.fn() as never,
    });

    for (const method of [
      "read",
      "write",
      "readBytes",
      "writeBytes",
      "append",
      "exists",
      "delete",
      "list",
    ] as const) {
      expect(typeof store[method]).toBe("function");
    }
  });
});
