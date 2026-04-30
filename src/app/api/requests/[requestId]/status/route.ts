import { STATUS_LABELS, isValidStatus } from "@/config/statuses";
import { jsonError, jsonOk } from "@/lib/api-response";
import { requireAdminSession } from "@/lib/admin-auth";
import { nowIso } from "@/lib/datetime";
import { appendHistory, getRequestById, updateRequestRecord } from "@/lib/repositories";
import { buildMarketingCommentNotification, buildStatusNotification, notifyRequester } from "@/lib/notifications";
import type { MarketingRequest, RequestStatus } from "@/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = requireAdminSession(request);
    const { requestId } = await context.params;
    const body = (await request.json()) as {
      status?: string;
      comment?: string;
      assigned_marketing_user?: string;
      purchase_request_no?: string;
    };
    const comment = String(body.comment ?? "").trim();

    if (body.status && !isValidStatus(body.status)) {
      return jsonError(new Error("Некорректный статус"), 400);
    }

    if (!body.status && !comment) {
      return jsonError(new Error("Укажите статус или комментарий"), 400);
    }

    const item = await getRequestById(requestId);
    if (!item) return jsonError(new Error("Заявка не найдена"), 404);

    const now = nowIso();
    const newStatus: RequestStatus = body.status && isValidStatus(body.status) ? body.status : item.current_status;
    const statusChanged = newStatus !== item.current_status;
    const patch: Partial<MarketingRequest> = {
      current_status: newStatus,
      current_status_label: STATUS_LABELS[newStatus],
      marketing_comment: comment || item.marketing_comment,
      assigned_marketing_user: body.assigned_marketing_user || admin.username,
      purchase_request_no: body.purchase_request_no ?? item.purchase_request_no,
      purchase_required: newStatus === "on_purchase" ? "Да" : item.purchase_required,
      last_updated_at: now,
      sent_at: newStatus === "sent" ? now : item.sent_at,
      completed_at: newStatus === "completed" ? now : item.completed_at,
      closed_at: newStatus === "closed" ? now : item.closed_at,
    };

    await updateRequestRecord(requestId, patch);

    const notificationText = statusChanged
      ? buildStatusNotification(requestId, item.current_status, newStatus, comment)
      : buildMarketingCommentNotification(requestId, comment);
    const notification = await notifyRequester(item.telegram_id, notificationText);

    await appendHistory({
      request_id: requestId,
      changed_at: now,
      changed_by: admin.username,
      changed_by_role: "marketing_head",
      old_status: item.current_status,
      new_status: newStatus,
      comment,
      requester_telegram_id: item.telegram_id,
      notification_sent: notification.ok ? "TRUE" : "FALSE",
      notification_sent_at: notification.sentAt,
      notification_text: notification.ok ? notificationText : notification.error ?? notificationText,
    });

    return jsonOk({ request: { ...item, ...patch } });
  } catch (error) {
    return jsonError(error);
  }
}
