import { jsonError, jsonOk } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth-context";
import { getRuntimeConfig } from "@/lib/env";
import { createSignedAttachmentUpload } from "@/lib/storage/supabase";
import { validateAttachmentFile } from "@/lib/storage/attachments";

export const runtime = "nodejs";

type UploadFileInput = {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
};

function fileLikeFromInput(input: UploadFileInput): File {
  return {
    name: String(input.fileName ?? ""),
    size: Number(input.fileSize ?? 0),
    type: String(input.mimeType ?? "application/octet-stream"),
  } as File;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext(request);
    const body = (await request.json()) as { files?: UploadFileInput[] };
    const files = Array.isArray(body.files) ? body.files.slice(0, 10) : [];

    if (!files.length) {
      return jsonError(new Error("Не переданы файлы для загрузки"), 400);
    }

    const maxUploadBytes = getRuntimeConfig().maxUploadBytes;
    const uploads = [];

    for (const file of files) {
      const fileName = String(file.fileName ?? "").trim();
      const fileSize = Number(file.fileSize ?? 0);
      const mimeType = String(file.mimeType ?? "application/octet-stream").trim();

      if (!fileName) throw new Error("У файла нет имени");
      try {
        validateAttachmentFile(fileLikeFromInput({ fileName, fileSize, mimeType }), maxUploadBytes);
      } catch (error) {
        return jsonError(error, 400);
      }

      uploads.push(
        await createSignedAttachmentUpload({
          fileName,
          fileSize,
          mimeType,
          ownerTelegramId: auth.appUser.telegram_id,
        }),
      );
    }

    return jsonOk({ uploads });
  } catch (error) {
    return jsonError(error);
  }
}
