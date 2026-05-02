import { DriveError, DriveFile } from "./types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

async function driveFetch(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
}
async function driveThrowIfError(
  res: Response,
  context: string
): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DriveError(`${context}: HTTP ${res.status}`, res.status, body);
  }
}
