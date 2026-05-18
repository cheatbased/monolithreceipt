import type { drive_v3 } from "googleapis";

const folderIdCache = new Map<string, string>();

function escapeDriveQueryStringLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Walk a chain of folders (each created if missing unless you reuse existing naming). */

export async function resolveFolderSegments(
  driveApi: drive_v3.Drive,
  rootFolderId: string,
  segments: string[],
): Promise<string> {
  let parentId = rootFolderId;

  for (let idx = 0; idx < segments.length; idx++) {
    const segment = segments[idx];
    if (!segment) continue;
    parentId = await getOrCreateChildFolder(driveApi, parentId, segment);
  }

  return parentId;
}

/** Child folder by `folderName` under `parentFolderId`, creating it if missing. */

export async function getOrCreateChildFolder(
  driveApi: drive_v3.Drive,
  parentFolderId: string,
  folderName: string,
): Promise<string> {
  const cacheKey = `${parentFolderId}::${folderName}`;
  const cached = folderIdCache.get(cacheKey);
  if (cached) return cached;

  const safeName = escapeDriveQueryStringLiteral(folderName);
  const q = `mimeType = 'application/vnd.google-apps.folder' and '${parentFolderId}' in parents and name = '${safeName}' and trashed = false`;

  const listed = await driveApi.files.list({
    q,
    spaces: "drive",
    fields: "files(id)",
    pageSize: 5,
  });

  let resolved = listed.data.files?.[0]?.id;

  if (!resolved) {
    const created = await driveApi.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      },
      fields: "id",
    });
    resolved = created.data.id ?? undefined;
  }

  if (!resolved) {
    throw new Error(`Could not resolve Drive subfolder "${folderName}"`);
  }

  folderIdCache.set(cacheKey, resolved);

  return resolved;
}
