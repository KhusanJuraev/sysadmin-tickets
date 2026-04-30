import { getTelegramConfig } from "@/lib/env";

export type TelegramSendResult = {
  ok: boolean;
  sentAt: string;
  error?: string;
};

export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: unknown): Promise<TelegramSendResult> {
  const sentAt = new Date().toISOString();
  const { botToken } = getTelegramConfig();
  console.info("TELEGRAM SEND START", { chatId });

  if (!botToken || !chatId) {
    const error = "Не задан Telegram bot token или chat_id";
    console.error("TELEGRAM SEND FAILED", { chatId, error });
    return { ok: false, sentAt, error };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("TELEGRAM SEND FAILED", { chatId, error });
      return { ok: false, sentAt, error };
    }

    console.info("TELEGRAM SEND SUCCESS", { chatId });
    return { ok: true, sentAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка Telegram API";
    console.error("TELEGRAM SEND FAILED", { chatId, error: message });
    return { ok: false, sentAt, error: message };
  }
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text = "") {
  const { botToken } = getTelegramConfig();
  if (!botToken || !callbackQueryId) {
    console.error("TELEGRAM CALLBACK ANSWER FAILED", { error: "Не задан Telegram bot token или callback_query_id" });
    return;
  }

  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  })
    .then((response) => {
      if (!response.ok) console.error("TELEGRAM CALLBACK ANSWER FAILED", { status: response.status });
    })
    .catch((error) => {
      console.error("TELEGRAM CALLBACK ANSWER FAILED", {
        error: error instanceof Error ? error.message : "Ошибка Telegram API",
      });
    });
}
