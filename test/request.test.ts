import { describe, it, expect, vi } from "vitest";
import {
  createContext,
  driveFetch,
  DEFAULT_API_BASE,
  DEFAULT_UPLOAD_BASE,
} from "../src/request";

// Pure unit tests — no network. A fake `fetch` is injected via options.

function okResponse(body = "ok"): Response {
  return new Response(body, { status: 200 });
}

describe("createContext", () => {
  it("normalizes a static string token into an async getter", async () => {
    const ctx = createContext({ accessToken: "tok-123" });
    await expect(ctx.getAccessToken()).resolves.toBe("tok-123");
  });

  it("passes through an async token supplier", async () => {
    const supplier = vi.fn(async () => "fresh-tok");
    const ctx = createContext({ accessToken: supplier });
    await expect(ctx.getAccessToken()).resolves.toBe("fresh-tok");
    expect(supplier).toHaveBeenCalledOnce();
  });

  it("applies the default Drive endpoints", () => {
    const ctx = createContext({ accessToken: "t" });
    expect(ctx.apiBase).toBe(DEFAULT_API_BASE);
    expect(ctx.uploadBase).toBe(DEFAULT_UPLOAD_BASE);
  });

  it("honors base-URL overrides", () => {
    const ctx = createContext({
      accessToken: "t",
      apiBaseUrl: "https://example.test/api",
      uploadBaseUrl: "https://example.test/upload",
    });
    expect(ctx.apiBase).toBe("https://example.test/api");
    expect(ctx.uploadBase).toBe("https://example.test/upload");
  });

  it("uses the injected fetch implementation", () => {
    const fake = vi.fn();
    const ctx = createContext({ accessToken: "t", fetch: fake as never });
    expect(ctx.fetchImpl).toBe(fake);
  });
});

describe("driveFetch", () => {
  it("attaches a bearer Authorization header from the token getter", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(okResponse())
    );
    const ctx = createContext({
      accessToken: "secret-token",
      fetch: fetchImpl as never,
    });

    await driveFetch(ctx, "https://example.test/x");

    const [, init] = fetchImpl.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
  });

  it("merges caller-supplied headers with the auth header", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(okResponse())
    );
    const ctx = createContext({
      accessToken: "t",
      fetch: fetchImpl as never,
    });

    await driveFetch(ctx, "https://example.test/x", {
      headers: { "Content-Type": "text/plain" },
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer t",
      "Content-Type": "text/plain",
    });
  });

  it("re-resolves the token on every call (supports refresh)", async () => {
    const supplier = vi.fn(async () => "rolling-token");
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(okResponse())
    );
    const ctx = createContext({
      accessToken: supplier,
      fetch: fetchImpl as never,
    });

    await driveFetch(ctx, "https://example.test/a");
    await driveFetch(ctx, "https://example.test/b");

    expect(supplier).toHaveBeenCalledTimes(2);
  });

  it("passes an abort signal to fetch when a timeout is configured", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(okResponse())
    );
    const ctx = createContext({
      accessToken: "t",
      timeoutMs: 5000,
      fetch: fetchImpl as never,
    });

    await driveFetch(ctx, "https://example.test/x");

    const [, init] = fetchImpl.mock.calls[0];
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("detaches its abort listener after a request settles (no leak)", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(okResponse())
    );
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    const ctx = createContext({
      accessToken: "t",
      signal: controller.signal,
      fetch: fetchImpl as never,
    });

    await driveFetch(ctx, "https://example.test/x");

    // Listener added for this request must be removed once it completes.
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("aborts the request when the caller's signal is already aborted", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new Error("aborted");
      }
      return okResponse();
    });
    const controller = new AbortController();
    controller.abort();

    const ctx = createContext({
      accessToken: "t",
      signal: controller.signal,
      fetch: fetchImpl as never,
    });

    await expect(driveFetch(ctx, "https://example.test/x")).rejects.toThrow();
  });
});
