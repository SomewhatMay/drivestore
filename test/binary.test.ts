import { describe, it, expect, vi } from "vitest";
import {
  createBinaryFile,
  createTextFile,
  findChildFile,
  readBytesById,
  updateBytesById,
  BINARY_MIME,
  FOLDER_MIME,
  RESUMABLE_THRESHOLD,
} from "../src/drive-api";
import { createContext } from "../src/request";

// Pure unit tests — an injected fetch stands in for Drive.

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function session(uri: string): Response {
  return new Response("", { status: 200, headers: { Location: uri } });
}

describe("binary uploads", () => {
  it("createBinaryFile initiates a resumable session then PUTs the bytes", async () => {
    const calls: { url: string; method?: string }[] = [];
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      if (url.includes("uploadType=resumable")) {
        return Promise.resolve(session("https://session.test/u/1"));
      }
      return Promise.resolve(json({ id: "bin-1" }));
    });

    const ctx = createContext({ accessToken: "t", fetch: fetchImpl as never });
    const id = await createBinaryFile(
      ctx,
      "parent",
      "db.sqlite",
      new Uint8Array([1, 2, 3])
    );

    expect(id).toBe("bin-1");
    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("uploadType=resumable");
    expect(calls[1].url).toBe("https://session.test/u/1");
    expect(calls[1].method).toBe("PUT");
  });

  it("readBytesById returns the raw bytes (binary-safe)", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array([5, 6, 7, 255]), { status: 200 }))
    );
    const ctx = createContext({ accessToken: "t", fetch: fetchImpl as never });

    const bytes = await readBytesById(ctx, "f");
    expect(Array.from(bytes)).toEqual([5, 6, 7, 255]);
  });

  it("updateBytesById uses a simple media PATCH below the threshold", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(json({ id: "f" }))
    );
    const ctx = createContext({ accessToken: "t", fetch: fetchImpl as never });

    await updateBytesById(ctx, "f", new Uint8Array([1, 2]));

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("uploadType=media");
    expect((init as RequestInit).method).toBe("PATCH");
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": BINARY_MIME,
    });
  });

  it("updateBytesById switches to resumable above the threshold", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn((url: string) => {
      urls.push(url);
      if (url.includes("uploadType=resumable")) {
        return Promise.resolve(session("https://session.test/u/2"));
      }
      return Promise.resolve(json({ id: "big" }));
    });
    const ctx = createContext({ accessToken: "t", fetch: fetchImpl as never });

    await updateBytesById(ctx, "f", new Uint8Array(RESUMABLE_THRESHOLD + 1));

    expect(urls[0]).toContain("uploadType=resumable");
    expect(urls).toContain("https://session.test/u/2");
  });
});

describe("text uploads", () => {
  it("uses a randomized multipart boundary for small text (not the old constant)", async () => {
    const contentTypes: string[] = [];
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      contentTypes.push((init?.headers as Record<string, string>)["Content-Type"]);
      return Promise.resolve(json({ id: "t" }));
    });
    const ctx = createContext({ accessToken: "t", fetch: fetchImpl as never });

    await createTextFile(ctx, "p", "a.txt", "hello");
    await createTextFile(ctx, "p", "b.txt", "hello");

    expect(contentTypes[0]).toMatch(/boundary=drivestore-/);
    expect(contentTypes[0]).not.toContain("drive_multipart_boundary");
    // Unique per call — no fixed boundary content can collide with.
    expect(contentTypes[0]).not.toBe(contentTypes[1]);
  });

  it("switches to resumable for large text", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn((url: string) => {
      urls.push(url);
      if (url.includes("uploadType=resumable")) {
        return Promise.resolve(session("https://session.test/u/3"));
      }
      return Promise.resolve(json({ id: "bigtext" }));
    });
    const ctx = createContext({ accessToken: "t", fetch: fetchImpl as never });

    const id = await createTextFile(
      ctx,
      "p",
      "big.txt",
      "a".repeat(RESUMABLE_THRESHOLD + 1)
    );

    expect(id).toBe("bigtext");
    expect(urls[0]).toContain("uploadType=resumable");
  });
});

describe("findChildFile", () => {
  it("excludes folders from its query so binary leaves resolve", async () => {
    const fetchImpl = vi.fn((_url: string) =>
      Promise.resolve(json({ files: [] }))
    );
    const ctx = createContext({ accessToken: "t", fetch: fetchImpl as never });

    await findChildFile(ctx, "p", "x");

    const q =
      new URL(fetchImpl.mock.calls[0][0]).searchParams.get("q") ?? "";
    expect(q).toContain(`mimeType != '${FOLDER_MIME}'`);
  });
});
