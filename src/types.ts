export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

export interface DriveStore {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  /** Creates the file if it does not exist; appends otherwise. NOT atomic under concurrent access. */
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
