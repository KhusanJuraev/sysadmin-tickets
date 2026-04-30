import { STATUS_LABELS } from "@/config/statuses";
import { jsonError, jsonOk } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth-context";
import { nowIso } from "@/lib/datetime";
import { getRuntimeConfig } from "@/lib/env";
import { appendHistory, getRequestById, updateRequestRecord } from "@/lib/repositories";
import { buildRequesterReplyNotification, notifyMarketing } from "@/lib/notifications";
import { normalizeAttachmentMetadata, normalizeUploadWarnings } from "@/lib/storage/attachments";
import { safeJsonParse } from "@/lib/utils";
import type { AttachmentMeta } from "@/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await getAuthContext(request);
    const { requestId } = await context.params;
    const item = await getRequestById(requestId);
    if (!item) return jsonError(new Error("Заявка не найдена"), 404);
    if (item.telegram_id !== auth.appUser.telegram_id) {
      return jsonError(new Error("Нет доступа к этой заявке"), 403);
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return jsonError(new Error("Уточнение принимает только JSON без бинарных файлов"), 415);
    }

    const body = (await request.json()) as {
      comment?: string;
      attachments?: unknown[];
      uploadWarnings?: unknown[];
    };
    const comment = String(body.comment ?? "").trim();
    const attachmentInput = Array.isArray(body.attachments) ? body.attachments : [];
    const uploadWarningInput = Array.isArray(body.uploadWarnings) ? body.uploadWarnings : [];

    const upload = {
      attachments: normalizeAttachmentMetadata(attachmentInput, getRuntimeConfig().maxUploadBytes),
      warnings: normalizeUploadWarnings(uploadWarningInput),
    };

    if (!comment && upload.attachments.length === 0 && upload.warnings.length === 0) {
      return jsonError(new Error("Добавьте комментарий или вложение"), 400);
    }

    const attachments = [
      ...safeJsonParse<AttachmentMeta[]>(item.attachments_list_json, []),
      ...upload.attachments,
    ];
    const now = nowIso();

    await updateRequestRecord(requestId, {
      current_status: "clarification_received",
      current_status_label: STATUS_LABELS.clarification_received,
      attachments_list_json: JSON.stringify(attachments),
      attachments_urls: attachments.map((attachment) => attachment.url).join("\n"),
      upload_warnings: [item.upload_warnings, ...upload.warnings].filter(Boolean).join("\n"),
      last_updated_at: now,
    });

    const historyComment = [
      comment,
      upload.warnings.length ? `Предупреждения по вложениям: ${upload.warnings.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await appendHistory({
      request_id: requestId,
      changed_at: now,
      changed_by: auth.appUser.fio || auth.appUser.username || auth.appUser.telegram_id,
      changed_by_role: auth.appUser.role,
      old_status: item.current_status,
      new_status: "clarification_received",
      comment: historyComment,
      requester_telegram_id: item.telegram_id,
      notification_sent: "FALSE",
      notification_sent_at: "",
      notification_text: "",
    });

    await notifyMarketing(
      buildRequesterReplyNotification(
        requestId,
        auth.appUser.fio || auth.appUser.username || auth.appUser.telegram_id,
        comment,
        upload.attachments.length,
      ),
    );

    return jsonOk({ uploaded: upload.attachments, warnings: upload.warnings });
  } catch (error) {
    return jsonError(error);
  }
}
