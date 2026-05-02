import { createFolder, findChild, FOLDER_MIME } from "./drive-api";
import { DriveError } from "./types";

export function splitPath(path: string): string[] {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function resolveRootFolder(
  rootName: string,
  accessToken: string,
  cachedRootId: string | null
): Promise<string> {
  if (cachedRootId) return cachedRootId;

  const existing = await findChild(
    "appDataFolder",
    rootName,
    accessToken,
    FOLDER_MIME
  );
  if (existing) return existing.id;

  return createFolder("appDataFolder", rootName, accessToken);
}
