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

export async function listAll(
  q: string,
  accessToken: string
): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("spaces", "appDataFolder");
    url.searchParams.set("q", q);
    // Trim fields to only what we use
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await driveFetch(url.toString(), accessToken);
    await driveThrowIfError(res, "Drive list");

    const data = (await res.json()) as {
      files?: DriveFile[];
      nextPageToken?: string;
    };

    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return out;
}
