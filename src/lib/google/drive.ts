import { randomUUID } from "crypto";
import { APP_CONFIG } from "@/config/app";
import { getGoogleOAuthConfig } from "@/lib/env";
import { readSettings } from "@/lib/google/sheets";
import { getDriveUserAccessToken } from "@/lib/google/oauth";
import { safeSegment } from "@/lib/utils";
import type { AttachmentMeta } from "@/types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

function withDriveSupport(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}supportsAllDrives=true`;
}

async function driveFetch(url: string, init?: RequestInit) {
  const accessToken = await getDriveUserAccessToken();
  const response = await fetch(withDriveSupport(url), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Drive API error: ${details}`);
  }

  return response.json();
}

export function extractDriveFolderId(urlOrId: string) {
  if (!urlOrId) return "";
  const match = urlOrId.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? urlOrId;
}

async function getParentFolderId() {
  const envFolder = getGoogleOAuthConfig().driveParentFolderId;
  if (envFolder) return extractDriveFolderId(envFolder);

  const settings = await readSettings();
  return extractDriveFolderId(settings.google_drive_parent_folder_id ?? "");
}

export async function createRequestFolder(requestId: string, city: string, subcategory: string) {
  const parentId = await getParentFolderId();
  if (!parentId) {
    throw new Error("Не задана корневая папка Google Drive");
  }

  const name = `${requestId}_${safeSegment(city, "city")}_${safeSegment(subcategory, "item")}`;

  const data = (await driveFetch(`${DRIVE_API}/files?fields=id,name,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  })) as { id: string; name: string; webViewLink?: string };

  return {
    id: data.id,
    name: data.name,
    url: data.webViewLink ?? `https://drive.google.com/drive/folders/${data.id}`,
  };
}

function getExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function getAttachmentType(mimeType: string): AttachmentMeta["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType) return "document";
  return "unknown";
}

export function validateFile(file: File, maxUploadBytes: number) {
  const extension = getExtension(file.name);
  if (!APP_CONFIG.allowedFileExtensions.includes(extension as never)) {
    throw new Error(`Файл ${file.name}: неподдерживаемый тип`);
  }

  if (file.size > maxUploadBytes) {
    throw new Error(
      `Файл ${file.name}: размер превышает лимит ${Math.round(maxUploadBytes / 1024 / 1024)} МБ`,
    );
  }
}

export async function uploadFileToFolder(
  file: File,
  folderId: string,
  requestId: string,
): Promise<AttachmentMeta> {
  const accessToken = await getDriveUserAccessToken();
  const safeName = `${requestId}_${safeSegment(file.name, "file")}`;
  const boundary = `mkt_${randomUUID()}`;

  const metadata = {
    name: safeName,
    parents: [folderId],
    mimeType: file.type || "application/octet-stream",
  };

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata,
      )}\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(
    withDriveSupport(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink`,
    ),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Не удалось загрузить файл ${file.name}: ${details}`);
  }

  const data = (await response.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
  };

  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: Number(data.size ?? file.size),
    url: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
    type: getAttachmentType(data.mimeType),
  };
}

export async function uploadFiles(
  files: File[],
  folderId: string,
  requestId: string,
  maxUploadBytes: number,
) {
  for (const file of files) {
    validateFile(file, maxUploadBytes);
  }

  const uploaded: AttachmentMeta[] = [];
  for (const file of files) {
    uploaded.push(await uploadFileToFolder(file, folderId, requestId));
  }

  return uploaded;
}

export type DriveUploadResult = {
  folder: { id: string; name: string; url: string } | null;
  attachments: AttachmentMeta[];
  warnings: string[];
};

export async function uploadRequestAttachmentsBestEffort(
  files: File[],
  requestId: string,
  city: string,
  subcategory: string,
  maxUploadBytes: number,
): Promise<DriveUploadResult> {
  if (files.length === 0) {
    return { folder: null, attachments: [], warnings: [] };
  }

  const warnings: string[] = [];
  let folder: DriveUploadResult["folder"] = null;

  try {
    folder = await createRequestFolder(requestId, city, subcategory);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Вложения не загружены: ${error.message}`
        : "Вложения не загружены: не удалось создать папку Google Drive",
    );
    return { folder: null, attachments: [], warnings };
  }

  const attachments: AttachmentMeta[] = [];
  for (const file of files) {
    try {
      validateFile(file, maxUploadBytes);
      attachments.push(await uploadFileToFolder(file, folder.id, requestId));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Файл ${file.name}: не удалось загрузить`);
    }
  }

  return { folder, attachments, warnings };
}

export async function uploadFilesToExistingFolderBestEffort(
  files: File[],
  folderId: string,
  requestId: string,
  maxUploadBytes: number,
) {
  const warnings: string[] = [];
  const attachments: AttachmentMeta[] = [];

  if (!folderId && files.length > 0) {
    return {
      attachments,
      warnings: ["Вложения не загружены: у заявки нет папки Google Drive"],
    };
  }

  for (const file of files) {
    try {
      validateFile(file, maxUploadBytes);
      attachments.push(await uploadFileToFolder(file, folderId, requestId));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Файл ${file.name}: не удалось загрузить`);
    }
  }

  return { attachments, warnings };
}
