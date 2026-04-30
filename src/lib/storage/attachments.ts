import { APP_CONFIG } from "@/config/app";
import type { AttachmentMeta } from "@/types";

export type AttachmentStorageResult = {
  folder: { id: string; name: string; url: string } | null;
  attachments: AttachmentMeta[];
  warnings: string[];
};

function getExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function validateAttachmentFile(file: File, maxUploadBytes: number) {
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

export async function storeRequestAttachmentsBestEffort(
  files: File[],
  requestId: string,
  maxUploadBytes: number,
): Promise<AttachmentStorageResult> {
  if (files.length === 0) {
    return { folder: null, attachments: [], warnings: [] };
  }

  const warnings: string[] = [];
  const validFiles: File[] = [];

  for (const file of files) {
    try {
      validateAttachmentFile(file, maxUploadBytes);
      validFiles.push(file);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Файл ${file.name}: не удалось проверить файл`);
    }
  }

  if (validFiles.length > 0) {
    warnings.push(
      `Вложения к заявке ${requestId} приняты интерфейсом, но файловое хранилище пока не подключено. Заявка создана без ссылок на файлы.`,
    );
  }

  return {
    folder: null,
    attachments: [],
    warnings,
  };
}

export async function storeAdditionalAttachmentsBestEffort(
  files: File[],
  requestId: string,
  maxUploadBytes: number,
) {
  return storeRequestAttachmentsBestEffort(files, requestId, maxUploadBytes);
}

function attachmentTypeFromMime(mimeType: string): AttachmentMeta["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType) return "document";
  return "unknown";
}

function shortenFileName(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 72) return trimmed;
  return `${trimmed.slice(0, 69)}...`;
}

export function formatUploadWarningMessage(message: string, fileName?: string) {
  const trimmed = String(message ?? "").trim();
  if (!trimmed) return "";

  const prefixed = trimmed.match(/^Файл\s+(.+?):\s*(.+)$/i);
  const effectiveFileName = shortenFileName(fileName ?? prefixed?.[1] ?? "");
  const detail = (prefixed?.[2] ?? trimmed).trim();
  const lower = detail.toLowerCase();
  const prefix = effectiveFileName ? `Файл ${effectiveFileName}: ` : "";

  if (lower.includes("invalid key")) {
    return `${prefix}имя содержит неподдерживаемые символы для хранилища. Переименуйте файл латиницей или отправьте заявку без вложения.`;
  }

  if (lower.includes("request entity too large") || detail.includes("413")) {
    return `${prefix}размер слишком большой. Можно отправить заявку без вложения.`;
  }

  if (lower.includes("bucket")) {
    return `${prefix}файловое хранилище пока недоступно. Можно отправить заявку без вложения.`;
  }

  if (lower.includes("signed") || lower.includes("storage")) {
    return `${prefix}вложение временно не удалось загрузить. Можно отправить заявку без файла.`;
  }

  return prefix ? `${prefix}${detail}` : trimmed;
}

export function normalizeAttachmentMetadata(value: unknown, maxUploadBytes: number): AttachmentMeta[] {
  if (!Array.isArray(value)) return [];

  const result: AttachmentMeta[] = [];

  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const source = item as Record<string, unknown>;
    const name = String(source.name ?? source.fileName ?? "").trim();
    const mimeType = String(source.mimeType ?? source.mime_type ?? "application/octet-stream").trim();
    const size = Number(source.size ?? source.fileSize ?? 0);
    const storagePath = String(source.storagePath ?? source.storage_path ?? "").trim();
    const url = String(source.url ?? source.publicUrl ?? source.public_url ?? "").trim();
    const bucket = String(source.bucket ?? "").trim();

    if (!name || !storagePath || !url) return;
    if (!Number.isFinite(size) || size < 0 || size > maxUploadBytes) return;

    result.push({
      id: String(source.id ?? storagePath ?? `${name}-${index}`),
      name,
      mimeType,
      size,
      url,
      storagePath,
      publicUrl: url,
      bucket,
      type: attachmentTypeFromMime(mimeType),
    });
  });

  return result;
}

export function normalizeUploadWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => formatUploadWarningMessage(String(item ?? "").trim()))
    .filter(Boolean)
    .slice(0, 10);
}
