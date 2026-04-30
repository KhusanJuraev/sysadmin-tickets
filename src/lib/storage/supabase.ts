import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseStorageConfig } from "@/lib/env";
import { safeSegment, safeStorageFileName } from "@/lib/utils";

export type SignedUploadInput = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  ownerTelegramId: string;
};

function cleanMimeType(value: string) {
  return value.trim() || "application/octet-stream";
}

export function buildStoragePath(input: SignedUploadInput) {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = safeStorageFileName(input.fileName, "attachment");
  return `requests/${safeSegment(input.ownerTelegramId, "user")}/${date}/${Date.now()}-${randomUUID()}-${safeName}`;
}

export function getSupabaseAdminClient() {
  const config = getSupabaseStorageConfig();
  return {
    config,
    client: createClient(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

export async function createSignedAttachmentUpload(input: SignedUploadInput) {
  const { client, config } = getSupabaseAdminClient();
  const storagePath = buildStoragePath(input);
  const mimeType = cleanMimeType(input.mimeType);

  const { data, error } = await client.storage.from(config.bucket).createSignedUploadUrl(storagePath, {
    upsert: false,
  });

  if (error || !data) {
    throw new Error(error?.message || "Не удалось подготовить загрузку файла");
  }

  const { data: publicData } = client.storage.from(config.bucket).getPublicUrl(storagePath);

  return {
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType,
    bucket: config.bucket,
    storagePath,
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: publicData.publicUrl,
    supabaseUrl: config.url,
    anonKey: config.anonKey,
  };
}
