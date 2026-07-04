import { DriveError, DriveFile } from "./types";
import { DriveContext, driveFetch, driveThrowIfError } from "./request";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function listAll(
  ctx: DriveContext,
  q: string
): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${ctx.apiBase}/files`);
    url.searchParams.set("spaces", "appDataFolder");
    url.searchParams.set("q", q);
    // Trim fields to only what we use
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await driveFetch(ctx, url.toString());
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

export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function findChild(
  ctx: DriveContext,
  parentId: string,
  name: string,
  mimeType?: string
): Promise<DriveFile | null> {
  const q = [
    `'${parentId}' in parents`,
    `name = '${escapeQueryValue(name)}'`,
    mimeType ? `mimeType = '${escapeQueryValue(mimeType)}'` : null,
    `trashed = false`,
  ]
    .filter(Boolean)
    .join(" and ");

  const files = await listAll(ctx, q);
  return files[0] ?? null;
}

export async function createFolder(
  ctx: DriveContext,
  parentId: string,
  name: string
): Promise<string> {
  const res = await driveFetch(ctx, `${ctx.apiBase}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  await driveThrowIfError(res, "Drive folder create");
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function readTextById(
  ctx: DriveContext,
  fileId: string
): Promise<string> {
  const res = await driveFetch(ctx, `${ctx.apiBase}/files/${fileId}?alt=media`);
  await driveThrowIfError(res, "Drive read");
  return res.text();
}

export async function updateTextById(
  ctx: DriveContext,
  fileId: string,
  content: string
): Promise<void> {
  const res = await driveFetch(
    ctx,
    `${ctx.uploadBase}/files/${fileId}?uploadType=media&fields=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "text/plain" },
      body: content,
    }
  );
  await driveThrowIfError(res, "Drive update");
}

export async function createTextFile(
  ctx: DriveContext,
  parentId: string,
  name: string,
  content: string
): Promise<string> {
  const boundary = "drive_multipart_boundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, mimeType: "text/plain", parents: [parentId] }) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;

  const res = await driveFetch(
    ctx,
    `${ctx.uploadBase}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  await driveThrowIfError(res, "Drive create");
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function deleteById(
  ctx: DriveContext,
  fileId: string
): Promise<void> {
  const res = await driveFetch(ctx, `${ctx.apiBase}/files/${fileId}`, {
    method: "DELETE",
  });
  // 404 is fine — already gone
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new DriveError(
      `Drive delete failed: HTTP ${res.status}`,
      res.status,
      body
    );
  }
}
