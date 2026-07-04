export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

export interface DriveStore {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  /**
   * Creates the file if it does not exist; appends otherwise. NOT atomic:
   * concurrent appends across tabs/processes may interleave or lose data.
   * Serialize access at the application level if that matters.
   */
  append(path: string, newContent: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
}

export interface DriveStoreOptions {
  accessToken: string | (() => Promise<string>);
  rootName?: string;
  /**
   * Custom `fetch` implementation. Defaults to the global `fetch`. Useful for
   * Node <18 (supply a polyfill), proxies, or injecting a mock in tests.
   */
  fetch?: typeof fetch;
  /** Abort signal applied to every request the store makes. */
  signal?: AbortSignal;
  /** Per-request timeout in milliseconds. Omit or use `0` to disable. */
  timeoutMs?: number;
  /** Override the Drive metadata API base URL (advanced / testing). */
  apiBaseUrl?: string;
  /** Override the Drive upload API base URL (advanced / testing). */
  uploadBaseUrl?: string;
  /**
   * Max retry attempts for transient failures (429/502/503/504), after the
   * first try. Defaults to `3`. Set to `0` to disable retries.
   */
  maxRetries?: number;
  /** Base delay (ms) for exponential backoff between retries. Defaults to `300`. */
  retryBaseDelayMs?: number;
}

/** Thrown on any Drive API HTTP error. Carries the status code and raw body. */
export class DriveError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string = ""
  ) {
    super(message);
    this.name = "DriveError";
  }
}
