"use client";

import { createClient } from "@supabase/supabase-js";
import { apiFetch } from "@/components/app/client-api";
import { formatUploadWarningMessage } from "@/lib/storage/attachments";
import type { AttachmentMeta } from "@/types";

type SignedUpload = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  bucket: string;
  storagePath: string;
  path: string;
  token: string;
  signedUrl: string;
  publicUrl: string;
  supabaseUrl: string;
  anonKey: string;
};

type SignedUploadResponse = {
  uploads: SignedUpload[];
};

function attachmentTypeFromMime(mimeType: string): AttachmentMeta["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType) return "document";
  return "unknown";
}

function humanUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : "Не удалось загрузить вложение";
  if (message.toLowerCase().includes("invalid key")) {
    return "Имя файла содержит неподдерживаемые символы для хранилища. Переименуйте файл латиницей или отправьте заявку без вложения.";
  }
  if (message.toLowerCase().includes("payload") || message.includes("413")) {
    return "Файл слишком большой. Можно отправить заявку без вложения.";
  }
  if (message.toLowerCase().includes("bucket")) {
    return "Хранилище файлов пока не настроено. Можно отправить заявку без вложения.";
  }
  if (message.includes("SUPABASE") || message.toLowerCase().includes("переменная окружения")) {
    return "Хранилище файлов пока не настроено. Можно отправить заявку без вложения.";
  }
  return message || "Не удалось загрузить вложение. Можно отправить заявку без файла.";
}

export async function uploadFilesToSupabase(files: File[]) {
  const attachments: AttachmentMeta[] = [];
  const warnings: string[] = [];

  if (!files.length) return { attachments, warnings };

  let signed: SignedUploadResponse;
  try {
    signed = await apiFetch<SignedUploadResponse>("/api/storage/signed-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: files.map((file) => ({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
        })),
      }),
    });
  } catch (error) {
    return {
      attachments,
      warnings: [humanUploadError(error)],
    };
  }

  const firstUpload = signed.uploads[0];
  if (!firstUpload) return { attachments, warnings: ["Не удалось подготовить загрузку вложений"] };

  const supabase = createClient(firstUpload.supabaseUrl, firstUpload.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  for (const [index, file] of files.entries()) {
    const upload = signed.uploads[index];
    if (!upload) {
      warnings.push(formatUploadWarningMessage("не удалось подготовить загрузку", file.name));
      continue;
    }

    const mimeType = file.type || upload.mimeType || "application/octet-stream";
    const { error } = await supabase.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.storagePath, upload.token, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      warnings.push(formatUploadWarningMessage(error.message, file.name));
      continue;
    }

    attachments.push({
      id: upload.storagePath,
      name: file.name,
      mimeType,
      size: file.size,
      url: upload.publicUrl,
      storagePath: upload.storagePath,
      publicUrl: upload.publicUrl,
      bucket: upload.bucket,
      type: attachmentTypeFromMime(mimeType),
    });
  }

  return { attachments, warnings };
}
