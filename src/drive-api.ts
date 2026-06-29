import { DriveError, DriveFile } from "./types";
import { DriveContext, driveFetch, driveThrowIfError } from "./request";

export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const TEXT_MIME = "text/plain";
export const BINARY_MIME = "application/octet-stream";

/**
 * Payloads at or above this size are sent via Drive's resumable upload
 * protocol instead of a single simple/multipart upload, which Google caps
 * around 5 MB. Keeps large blobs (e.g. a serialized database) from failing.
 */
export const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;

function byteLength(content: string | Uint8Array): number {
  return typeof content === "string"
    ? new TextEncoder().encode(content).byteLength
    : content.byteLength;
}

/** An unguessable multipart boundary, so file content can never collide with it. */
function randomBoundary(): string {
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `drivestore-${rand}`;
}

/**
 * Uploads `body` via Drive's resumable protocol: initiate a session (carrying
 * the metadata), then PUT the bytes to the returned session URI. Used for both
 * create (`POST`) and update (`PATCH`) of large or binary payloads.
 *
 * The body is sent in a single PUT; chunked resume-after-failure can be layered
 * on later without changing callers.
 */
async function resumableUpload(
  ctx: DriveContext,
  initUrl: string,
  initMethod: "POST" | "PATCH",
  metadata: Record<string, unknown>,
  body: string | Uint8Array,
  contentType: string
): Promise<string> {
  const initRes = await driveFetch(ctx, initUrl, {
    method: initMethod,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": String(byteLength(body)),
    },
    body: JSON.stringify(metadata),
  });
  await driveThrowIfError(initRes, "Drive resumable init");

  const sessionUri = initRes.headers.get("location");
  if (!sessionUri) {
    throw new DriveError("Drive resumable init: no session URI returned", 0);
  }

  const uploadRes = await driveFetch(ctx, sessionUri, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    // Cast: a Uint8Array is a valid fetch body, but TS 5.7's stricter
    // BodyInit (esp. with @types/node) rejects Uint8Array<ArrayBufferLike>.
    body: body as BodyInit,
  });
  await driveThrowIfError(uploadRes, "Drive resumable upload");
  const data = (await uploadRes.json()) as { id: string };
  return data.id;
}

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

export async function listChildren(
  ctx: DriveContext,
  parentId: string
): Promise<DriveFile[]> {
  return listAll(ctx, `'${parentId}' in parents and trashed = false`);
}

/**
 * Finds a non-folder child by name, regardless of its MIME type. Used to
 * resolve leaf files so both text and binary files are discoverable (a plain
 * `mimeType = 'text/plain'` filter would miss binary uploads).
 */
export async function findChildFile(
  ctx: DriveContext,
  parentId: string,
  name: string
): Promise<DriveFile | null> {
  const q = [
    `'${parentId}' in parents`,
    `name = '${escapeQueryValue(name)}'`,
    `mimeType != '${FOLDER_MIME}'`,
    `trashed = false`,
  ].join(" and ");

  const files = await listAll(ctx, q);
  return files[0] ?? null;
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

export async function readBytesById(
  ctx: DriveContext,
  fileId: string
): Promise<Uint8Array> {
  const res = await driveFetch(ctx, `${ctx.apiBase}/files/${fileId}?alt=media`);
  await driveThrowIfError(res, "Drive read");
  return new Uint8Array(await res.arrayBuffer());
}

async function simpleMediaUpdate(
  ctx: DriveContext,
  fileId: string,
  body: string | Uint8Array,
  contentType: string
): Promise<void> {
  const res = await driveFetch(
    ctx,
    `${ctx.uploadBase}/files/${fileId}?uploadType=media&fields=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": contentType },
      // See resumableUpload: Uint8Array is a valid body; cast for TS 5.7.
      body: body as BodyInit,
    }
  );
  await driveThrowIfError(res, "Drive update");
}

export async function updateTextById(
  ctx: DriveContext,
  fileId: string,
  content: string
): Promise<void> {
  if (byteLength(content) > RESUMABLE_THRESHOLD) {
    await resumableUpload(
      ctx,
      `${ctx.uploadBase}/files/${fileId}?uploadType=resumable&fields=id`,
      "PATCH",
      {},
      content,
      TEXT_MIME
    );
    return;
  }
  await simpleMediaUpdate(ctx, fileId, content, TEXT_MIME);
}

export async function updateBytesById(
  ctx: DriveContext,
  fileId: string,
  data: Uint8Array
): Promise<void> {
  if (data.byteLength > RESUMABLE_THRESHOLD) {
    await resumableUpload(
      ctx,
      `${ctx.uploadBase}/files/${fileId}?uploadType=resumable&fields=id`,
      "PATCH",
      {},
      data,
      BINARY_MIME
    );
    return;
  }
  await simpleMediaUpdate(ctx, fileId, data, BINARY_MIME);
}

export async function createTextFile(
  ctx: DriveContext,
  parentId: string,
  name: string,
  content: string
): Promise<string> {
  // Large text bypasses the ~5 MB simple/multipart ceiling via resumable upload.
  if (byteLength(content) > RESUMABLE_THRESHOLD) {
    return resumableUpload(
      ctx,
      `${ctx.uploadBase}/files?uploadType=resumable&fields=id`,
      "POST",
      { name, mimeType: TEXT_MIME, parents: [parentId] },
      content,
      TEXT_MIME
    );
  }

  const boundary = randomBoundary();
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, mimeType: TEXT_MIME, parents: [parentId] }) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${TEXT_MIME}\r\n\r\n` +
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

/**
 * Creates a binary file. Always uses the resumable protocol: it carries the
 * metadata in the init request and the raw bytes in a single PUT, sidestepping
 * the multipart-boundary/encoding hazards of mixing binary into a string body.
 */
export async function createBinaryFile(
  ctx: DriveContext,
  parentId: string,
  name: string,
  data: Uint8Array
): Promise<string> {
  return resumableUpload(
    ctx,
    `${ctx.uploadBase}/files?uploadType=resumable&fields=id`,
    "POST",
    { name, mimeType: BINARY_MIME, parents: [parentId] },
    data,
    BINARY_MIME
  );
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
