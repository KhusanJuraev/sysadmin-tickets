import { REQUEST_TYPE_LABELS } from "@/config/app";
import { getStatusLabel } from "@/config/statuses";
import { getRuntimeConfig, getTelegramConfig } from "@/lib/env";
import { sendTelegramMessage, type TelegramSendResult } from "@/lib/telegram/client";
import type { MarketingRequest, RequestStatus } from "@/types";

function safeText(value?: string | null) {
  return String(value ?? "").trim();
}

function shorten(value: string, max = 220) {
  const text = safeText(value);
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function adminUrl(appUrl: string) {
  try {
    return new URL("/admin", appUrl).toString();
  } catch {
    return "";
  }
}

export function buildCreatedNotification(request: MarketingRequest) {
  return [
    "✅ Заявка принята",
    `Номер: ${request.request_id}`,
    `Тип: ${REQUEST_TYPE_LABELS[request.request_type]}`,
    `Категория: ${request.category || "—"}`,
    `Статус: ${request.current_status_label}`,
  ].join("\n");
}

export function buildStatusNotification(
  requestId: string,
  oldStatus: string,
  newStatus: RequestStatus,
  comment: string,
) {
  const lines = [
    `Обновление по заявке ${requestId}`,
    `Статус изменен: ${getStatusLabel(oldStatus)} → ${getStatusLabel(newStatus)}`,
  ];

  if (safeText(comment)) {
    lines.push(`Комментарий: ${safeText(comment)}`);
  }

  if (newStatus === "need_clarification") {
    lines.push("Откройте Mini App и дополните заявку.");
  }

  return lines.join("\n");
}

export function buildMarketingCommentNotification(requestId: string, comment: string) {
  return [
    `Комментарий маркетинга по заявке ${requestId}`,
    safeText(comment) ? `Комментарий: ${safeText(comment)}` : "",
    "Откройте Mini App, чтобы ответить или посмотреть детали.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRequesterReplyNotification(requestId: string, requesterName: string, comment: string, filesCount = 0) {
  return [
    `Ответ по заявке ${requestId}`,
    `Отправитель: ${safeText(requesterName) || "Заявитель"}`,
    safeText(comment) ? `Комментарий: ${shorten(comment, 320)}` : "",
    filesCount ? `Вложений: ${filesCount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMarketingNewRequestNotification(request: MarketingRequest) {
  const requirement = request.requirements || request.description;
  return [
    "📥 НОВАЯ ЗАЯВКА",
    "",
    `🆔 ${request.request_id}`,
    `👤 Отправитель: ${request.requester_fio || "—"}`,
    `🏢 Отдел: ${request.department || "—"}`,
    `📍 Филиал/регион: ${request.branch || "—"}`,
    `🗂 Тип: ${REQUEST_TYPE_LABELS[request.request_type]}`,
    `📦 Категория: ${request.category || "—"}`,
    `🧩 Подкатегория: ${request.subcategory || "—"}`,
    `🔢 Количество: ${request.quantity || "—"} ${request.unit || ""}`.trim(),
    `🚚 Доставка: ${request.need_delivery ? "да" : "нет"}`,
    `🛠 Монтаж: ${request.need_installation ? "да" : "нет"}`,
    `📝 Требование: ${shorten(requirement)}`,
    safeText(request.upload_warnings) ? `⚠️ Вложения: ${shorten(request.upload_warnings, 300)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function notifyRequester(chatId: string, text: string): Promise<TelegramSendResult> {
  return sendTelegramMessage(chatId, text);
}

export async function notifyMarketing(text: string): Promise<TelegramSendResult> {
  const { marketingChatId } = getTelegramConfig();
  const { appUrl } = getRuntimeConfig();
  const url = adminUrl(appUrl);

  if (!safeText(marketingChatId)) {
    return {
      ok: false,
      sentAt: "",
      error: "Не задан TELEGRAM_MARKETING_CHAT_ID",
    };
  }

  if (!isHttpsUrl(url)) {
    return sendTelegramMessage(
      marketingChatId,
      [text, "", "Кнопка админ-панели временно отключена: нужен публичный HTTPS URL."].join("\n"),
    );
  }

  const withButton = await sendTelegramMessage(marketingChatId, text, {
    inline_keyboard: [[{ text: "Открыть админ-панель", url }]],
  });

  if (withButton.ok) return withButton;

  console.warn("MARKETING NOTIFICATION BUTTON FAILED, FALLING BACK TO TEXT", {
    error: withButton.error,
  });

  const fallback = await sendTelegramMessage(
    marketingChatId,
    [text, "", `Админ-панель: ${url}`].join("\n"),
  );

  if (fallback.ok) return fallback;
  return {
    ok: false,
    sentAt: fallback.sentAt || withButton.sentAt,
    error: fallback.error || withButton.error,
  };
}
