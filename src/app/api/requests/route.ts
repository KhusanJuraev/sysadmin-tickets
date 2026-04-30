import { REQUEST_TYPE_LABELS } from "@/config/app";
import { STATUS_LABELS } from "@/config/statuses";
import { jsonError, jsonOk } from "@/lib/api-response";
import { requireAdminSession } from "@/lib/admin-auth";
import { getAuthContext } from "@/lib/auth-context";
import { todayInTimezone, nowIso } from "@/lib/datetime";
import { getRuntimeConfig } from "@/lib/env";
import { ensureSpreadsheetStructure } from "@/lib/google/sheets";
import {
  normalizeAttachmentMetadata,
  normalizeUploadWarnings,
  type AttachmentStorageResult,
} from "@/lib/storage/attachments";
import {
  appendHistory,
  createRequestRecord,
  listRequests,
  listRequestsForTelegramId,
  mergeProfileIntoUser,
  upsertUser,
} from "@/lib/repositories";
import { generateRequestId } from "@/lib/request-id";
import {
  buildCreatedNotification,
  buildMarketingNewRequestNotification,
  notifyMarketing,
  notifyRequester,
} from "@/lib/notifications";
import { parsePayload } from "@/lib/validation";
import type { MarketingRequest, RequestPayload } from "@/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "mine";

    if (scope === "all") {
      requireAdminSession(request);
      return jsonOk({ requests: await listRequests() });
    }

    const auth = await getAuthContext(request);
    return jsonOk({ requests: await listRequestsForTelegramId(auth.appUser.telegram_id) });
  } catch (error) {
    return jsonError(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSpreadsheetStructure();

    const auth = await getAuthContext(request);
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return jsonError(new Error("Создание заявки принимает только JSON без бинарных файлов"), 415);
    }

    const body = (await request.json()) as {
      payload?: unknown;
      attachments?: unknown[];
      uploadWarnings?: unknown[];
    };
    const payloadSource = JSON.stringify(body.payload ?? {});
    const attachmentInput = Array.isArray(body.attachments) ? body.attachments : [];
    const uploadWarningInput = Array.isArray(body.uploadWarnings) ? body.uploadWarnings : [];

    const requesterTelegramId = String(auth.telegramUser.id);
    const officeLocation = auth.appUser.office_location || auth.appUser.branch;
    const profilePatch = {
      requester_fio: auth.appUser.fio,
      telegram_id: requesterTelegramId,
      telegram_username: auth.appUser.username || auth.telegramUser.username || "",
      phone: auth.appUser.phone,
      position: auth.appUser.position,
      department: auth.appUser.department,
      branch: officeLocation,
      city: officeLocation,
    } satisfies Partial<RequestPayload>;
    const payload = parsePayload(payloadSource, profilePatch);
    const upload: AttachmentStorageResult = {
      folder: null,
      attachments: normalizeAttachmentMetadata(attachmentInput, getRuntimeConfig().maxUploadBytes),
      warnings: normalizeUploadWarnings(uploadWarningInput),
    };

    const now = nowIso();
    const requestId = await generateRequestId();

    const requestRecord: MarketingRequest = {
      ...payload,
      request_id: requestId,
      created_at: now,
      created_date: todayInTimezone(),
      telegram_id: requesterTelegramId,
      telegram_username: payload.telegram_username,
      attachments_folder_url: upload.folder?.url ?? "",
      attachments_list_json: JSON.stringify(upload.attachments),
      attachments_urls: upload.attachments.map((attachment) => attachment.url).join("\n"),
      drive_folder_url: upload.folder?.url ?? "",
      upload_warnings: upload.warnings.join("\n"),
      current_status: "new",
      current_status_label: STATUS_LABELS.new,
      marketing_comment: "",
      assigned_marketing_user: "",
      purchase_required: payload.need_purchase === "yes" ? "Да" : "",
      purchase_request_no: "",
      sent_at: "",
      completed_at: "",
      closed_at: "",
      last_updated_at: now,
    };

    await upsertUser(mergeProfileIntoUser(auth.appUser, requestRecord));
    await createRequestRecord(requestRecord);

    const requesterText = buildCreatedNotification(requestRecord);
    const requesterNotification = await notifyRequester(requesterTelegramId, requesterText);

    const warnings = [...upload.warnings];

    const marketingText = buildMarketingNewRequestNotification(requestRecord);
    const marketingNotification = await notifyMarketing(marketingText);

    if (!marketingNotification.ok) {
      warnings.push(`Уведомление в технического отдела не отправлено: ${marketingNotification.error ?? "неизвестная ошибка"}`);
    }

    await appendHistory({
      request_id: requestId,
      changed_at: now,
      changed_by: requestRecord.requester_fio,
      changed_by_role: auth.appUser.role,
      old_status: "",
      new_status: "new",
      comment: [
        `Создана заявка: ${REQUEST_TYPE_LABELS[requestRecord.request_type]}`,
        upload.warnings.length ? `Предупреждения по вложениям: ${upload.warnings.join("; ")}` : "",
        !marketingNotification.ok
          ? `Уведомление маркетингу не отправлено: ${marketingNotification.error ?? "неизвестная ошибка"}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      requester_telegram_id: requesterTelegramId,
      notification_sent: requesterNotification.ok ? "TRUE" : "FALSE",
      notification_sent_at: requesterNotification.sentAt,
      notification_text: requesterNotification.ok ? requesterText : requesterNotification.error ?? requesterText,
    });

    return jsonOk({
      request: requestRecord,
      attachments: upload.attachments,
      warnings,
      marketingNotification: {
        ok: marketingNotification.ok,
        error: marketingNotification.ok ? "" : marketingNotification.error ?? "Не удалось отправить уведомление в маркетинг",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
