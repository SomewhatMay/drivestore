import { DriveError } from "./types";

export const DEFAULT_API_BASE = "https://www.googleapis.com/drive/v3";
export const DEFAULT_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

/**
 * Everything a low-level Drive call needs: how to obtain a (possibly
 * refreshed) token, which `fetch` to use, optional cancellation/timeout,
 * and which endpoints to talk to. Built once per store via {@link createContext}
 * and threaded through every `drive-api` / `drive-path` function.
 */
export interface DriveContext {
  /** Resolves a fresh OAuth access token. Called before every request. */
  getAccessToken: () => Promise<string>;
  /** `fetch` implementation to use (defaults to the global `fetch`). */
  fetchImpl: typeof fetch;
  /** Caller-supplied abort signal applied to every request. */
  signal?: AbortSignal;
  /** Per-request timeout in milliseconds. `0`/`undefined` disables it. */
  timeoutMs?: number;
  /** Base URL for the Drive metadata API. */
  apiBase: string;
  /** Base URL for the Drive upload API. */
  uploadBase: string;
}

/** Options accepted by {@link createContext}; a subset of `DriveStoreOptions`. */
export interface ContextOptions {
  accessToken: string | (() => Promise<string>);
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  apiBaseUrl?: string;
  uploadBaseUrl?: string;
}

/**
 * Normalizes user-facing options into a {@link DriveContext}. Accepts a static
 * token or an async supplier, falls back to the global `fetch`, and applies the
 * default Google endpoints unless overridden (useful for proxies and testing).
 */
export function createContext(options: ContextOptions): DriveContext {
  const getAccessToken: () => Promise<string> =
    typeof options.accessToken === "string"
      ? () => Promise.resolve(options.accessToken as string)
      : options.accessToken;

  const fetchImpl =
    options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
  if (!fetchImpl) {
    throw new Error(
      "drivestore: no global `fetch` is available. Pass a `fetch` implementation " +
        "via options (e.g. on Node <18, supply a polyfill such as `undici`)."
    );
  }

  return {
    getAccessToken,
    fetchImpl,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    apiBase: options.apiBaseUrl ?? DEFAULT_API_BASE,
    uploadBase: options.uploadBaseUrl ?? DEFAULT_UPLOAD_BASE,
  };
}

interface PreparedSignal {
  signal: AbortSignal | undefined;
  cleanup: () => void;
}

/**
 * Combines the caller's abort signal (if any) with a timeout-driven one into a
 * single signal. Returns `cleanup` to clear the timer once the request settles.
 */
function prepareSignal(ctx: DriveContext): PreparedSignal {
  const hasTimeout = typeof ctx.timeoutMs === "number" && ctx.timeoutMs > 0;
  if (!ctx.signal && !hasTimeout) return { signal: undefined, cleanup: () => {} };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: () => void = () => {};

  const abort = (reason: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };

  if (ctx.signal) {
    if (ctx.signal.aborted) {
      abort(ctx.signal.reason);
    } else {
      // Capture the listener so it can be detached on cleanup — otherwise a
      // long-lived caller signal accumulates one dead listener per request.
      const external = ctx.signal;
      const onAbort = () => abort(external.reason);
      external.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () =>
        external.removeEventListener("abort", onAbort);
    }
  }

  if (hasTimeout) {
    timer = setTimeout(
      () => abort(new Error("drivestore: request timed out")),
      ctx.timeoutMs
    );
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      removeAbortListener();
    },
  };
}

/**
 * Performs a single authenticated request: resolves a token, attaches the
 * bearer header, and applies the combined abort/timeout signal.
 */
export async function driveFetch(
  ctx: DriveContext,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const token = await ctx.getAccessToken();
  const { signal, cleanup } = prepareSignal(ctx);

  try {
    return await ctx.fetchImpl(url, {
      ...init,
      signal: signal ?? init?.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    cleanup();
  }
}

export async function driveThrowIfError(
  res: Response,
  context: string
): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DriveError(`${context}: HTTP ${res.status}`, res.status, body);
  }
}
