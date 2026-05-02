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
