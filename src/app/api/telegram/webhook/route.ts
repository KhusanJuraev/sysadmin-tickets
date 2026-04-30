import { ONBOARDING_DEPARTMENTS, ONBOARDING_OFFICES, ONBOARDING_POSITIONS } from "@/config/onboarding";
import { jsonOk } from "@/lib/api-response";
import { nowIso } from "@/lib/datetime";
import { getRuntimeConfig } from "@/lib/env";
import {
  createUserRecord,
  getUserLookupByTelegramId,
  updateUserByTelegramId,
  updateUserLookup,
  type UserLookup,
} from "@/lib/repositories";
import { buildDefaultAppUser } from "@/lib/telegram/auth";
import { answerTelegramCallbackQuery, sendTelegramMessage } from "@/lib/telegram/client";
import type { AppUser, OnboardingStep, TelegramUser } from "@/types";

export const runtime = "nodejs";

type TelegramFrom = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    chat: { id: number | string };
    text?: string;
    from?: TelegramFrom;
    contact?: { phone_number?: string; user_id?: number };
    location?: { latitude?: number; longitude?: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramFrom;
    message?: { chat: { id: number | string } };
  };
};

type OnboardingSession = {
  user: AppUser;
  lookup: UserLookup | null;
  isNew: boolean;
};

const RESTART_CALLBACK = "onboarding:restart";
const CONFIRM_CALLBACK = "onboarding:confirm";

function logError(label: string, error: unknown, meta: Record<string, unknown> = {}) {
  console.error(label, {
    ...meta,
    error: error instanceof Error ? error.message : String(error),
  });
}

function toTelegramUser(from: TelegramFrom): TelegramUser {
  return {
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
  };
}

function getMiniAppReplyMarkup() {
  const appUrl = getRuntimeConfig().appUrl;

  try {
    const url = new URL(appUrl);
    if (url.protocol !== "https:") {
      console.error("MINI APP URL INVALID", { appUrl, reason: "Для Telegram Web App нужен HTTPS URL" });
      return undefined;
    }
  } catch {
    console.error("MINI APP URL INVALID", { appUrl, reason: "Некорректный URL" });
    return undefined;
  }

  return {
    inline_keyboard: [[{ text: "Открыть Mini App", web_app: { url: appUrl } }]],
  };
}

function contactKeyboard() {
  return {
    keyboard: [[{ text: "Отправить номер телефона", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function locationKeyboard() {
  return {
    keyboard: [[{ text: "Отправить геолокацию", request_location: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function inlineOptions(prefix: string, values: readonly string[]) {
  const buttons = values.map((value, index) => ({ text: value, callback_data: `${prefix}:${index}` }));
  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return { inline_keyboard: rows };
}

function summaryKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Подтвердить", callback_data: CONFIRM_CALLBACK }],
      [{ text: "Заполнить заново", callback_data: RESTART_CALLBACK }],
    ],
  };
}

function formatProfileSummary(user: AppUser) {
  return [
    "Проверьте данные профиля:",
    "",
    `ФИО: ${user.fio || "не указано"}`,
    `Телефон: ${user.phone || "не указан"}`,
    `Должность: ${user.position || "не указана"}`,
    `Отдел: ${user.department || "не указан"}`,
    `Офис: ${user.office_location || user.branch || "не указан"}`,
    "",
    "Если всё верно, нажмите «Подтвердить».",
  ].join("\n");
}

function isValidFio(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function isProfileReadyForConfirm(user: AppUser) {
  return Boolean(user.fio && user.phone && user.position && user.department && (user.office_location || user.branch));
}

function getTelegramMetaPatch(user: AppUser, telegramUser: TelegramUser) {
  const patch: Partial<AppUser> = {};
  if (telegramUser.username && telegramUser.username !== user.username) patch.username = telegramUser.username;
  if (telegramUser.first_name && telegramUser.first_name !== user.telegram_first_name) {
    patch.telegram_first_name = telegramUser.first_name;
  }
  if (telegramUser.last_name && telegramUser.last_name !== user.telegram_last_name) {
    patch.telegram_last_name = telegramUser.last_name;
  }
  return patch;
}

async function ensureOnboardingUser(
  telegramUser: TelegramUser,
  lookup: UserLookup | null,
): Promise<OnboardingSession> {
  const now = nowIso();

  if (lookup) {
    const patch = getTelegramMetaPatch(lookup.user, telegramUser);
    if (Object.keys(patch).length === 0) {
      return { user: lookup.user, lookup, isNew: false };
    }

    console.info("USER UPDATE START", { telegramId: lookup.user.telegram_id, reason: "telegram_meta" });
    try {
      const updated = await updateUserLookup(lookup, { ...patch, updated_at: now });
      console.info("USER UPDATE SUCCESS", { telegramId: updated.telegram_id, reason: "telegram_meta" });
      return { user: updated, lookup: { ...lookup, user: updated }, isNew: false };
    } catch (error) {
      logError("USER UPDATE FAILED", error, { telegramId: lookup.user.telegram_id, reason: "telegram_meta" });
      return { user: lookup.user, lookup, isNew: false };
    }
  }

  const user = {
    ...buildDefaultAppUser(telegramUser),
    registration_status: "new",
    onboarding_step: "collecting_fio",
    created_at: now,
    updated_at: now,
  } satisfies AppUser;

  console.info("USER UPDATE START", { telegramId: user.telegram_id, reason: "create_profile" });
  await createUserRecord(user);
  console.info("USER UPDATE SUCCESS", { telegramId: user.telegram_id, reason: "create_profile" });

  return { user, lookup: null, isNew: true };
}

async function patchUser(user: AppUser, patch: Partial<AppUser>, lookup: UserLookup | null) {
  const nextPatch = { ...patch, updated_at: nowIso() };
  console.info("USER UPDATE START", {
    telegramId: user.telegram_id,
    step: patch.onboarding_step,
    status: patch.registration_status,
  });

  try {
    const updated = lookup
      ? await updateUserLookup(lookup, nextPatch)
      : await updateUserByTelegramId(user.telegram_id, nextPatch);

    const fallback = {
      ...user,
      ...nextPatch,
      branch: nextPatch.office_location || nextPatch.branch || user.branch,
      office_location: nextPatch.office_location || nextPatch.branch || user.office_location,
    } as AppUser;

    console.info("USER UPDATE SUCCESS", { telegramId: user.telegram_id });
    return updated ?? fallback;
  } catch (error) {
    logError("USER UPDATE FAILED", error, { telegramId: user.telegram_id });
    throw error;
  }
}

async function sendMiniAppAccess(chatId: string, lines: string[]) {
  const replyMarkup = getMiniAppReplyMarkup();
  if (replyMarkup) {
    await sendTelegramMessage(chatId, lines.join("\n"), replyMarkup);
    return;
  }

  await sendTelegramMessage(
    chatId,
    [
      ...lines,
      "",
      "Mini App URL пока не настроен для Telegram. Обратитесь к администратору, чтобы указать публичный HTTPS адрес.",
    ].join("\n"),
  );
}

async function sendCompleted(chatId: string) {
  await sendMiniAppAccess(chatId, [
    "Вы уже зарегистрированы.",
    "",
    "Можно открыть Mini App и создать заявку в отдел маркетинга.",
  ]);
}

async function sendStepPrompt(chatId: string, user: AppUser, welcome = false) {
  if (user.registration_status === "completed") {
    await sendCompleted(chatId);
    return;
  }

  const prefix = welcome
    ? "Добро пожаловать в систему заявок маркетинга.\nПройдите короткую регистрацию, чтобы Mini App мог автоматически заполнить ваш профиль.\n\n"
    : "";

  const step = user.onboarding_step as OnboardingStep;
  console.info("HANDLE STEP", { telegramId: user.telegram_id, step });

  if (step === "collecting_phone") {
    await sendTelegramMessage(chatId, `${prefix}Шаг 2 из 6. Отправьте номер телефона через кнопку ниже.`, contactKeyboard());
    return;
  }

  if (step === "collecting_location") {
    await sendTelegramMessage(chatId, `${prefix}Шаг 3 из 6. Отправьте геолокацию через кнопку ниже.`, locationKeyboard());
    return;
  }

  if (step === "collecting_position") {
    await sendTelegramMessage(chatId, `${prefix}Шаг 4 из 6. Выберите должность.`, inlineOptions("onboarding:position", ONBOARDING_POSITIONS));
    return;
  }

  if (step === "collecting_department") {
    await sendTelegramMessage(chatId, `${prefix}Шаг 5 из 6. Выберите отдел.`, inlineOptions("onboarding:department", ONBOARDING_DEPARTMENTS));
    return;
  }

  if (step === "collecting_office") {
    await sendTelegramMessage(chatId, `${prefix}Шаг 6 из 6. Выберите офис или филиал.`, inlineOptions("onboarding:office", ONBOARDING_OFFICES));
    return;
  }

  if (step === "completed") {
    await sendTelegramMessage(chatId, formatProfileSummary(user), summaryKeyboard());
    return;
  }

  await sendTelegramMessage(chatId, `${prefix}Шаг 1 из 6. Напишите ФИО полностью.\nНапример: Иванов Иван Иванович`);
}

async function restartOnboarding(chatId: string, user: AppUser, lookup: UserLookup | null) {
  try {
    const restarted = await patchUser(
      user,
      {
        fio: "",
        phone: "",
        position: "",
        department: "",
        branch: "",
        office_location: "",
        geo_lat: "",
        geo_lng: "",
        registration_status: "new",
        onboarding_step: "collecting_fio",
      },
      lookup,
    );
    await sendStepPrompt(chatId, restarted, true);
  } catch (error) {
    logError("ONBOARDING RESTART FAILED", error, { telegramId: user.telegram_id });
    await sendTelegramMessage(
      chatId,
      "Не удалось перезапустить регистрацию из-за технической ошибки. Попробуйте еще раз через несколько секунд.",
    );
  }
}

async function handleStart(chatId: string, session: OnboardingSession) {
  console.info("HANDLE START", {
    telegramId: session.user.telegram_id,
    isNew: session.isNew,
    status: session.user.registration_status,
    step: session.user.onboarding_step,
  });

  if (session.user.registration_status === "completed") {
    await sendCompleted(chatId);
    return;
  }

  await sendStepPrompt(chatId, session.user, session.isNew);
}

async function handleMessage(update: TelegramUpdate) {
  const message = update.message;
  const chatId = message?.chat.id;
  const from = message?.from;
  if (!chatId || !from?.id) return;

  const telegramUser = toTelegramUser(from);
  const telegramId = String(telegramUser.id);
  const text = message?.text?.trim() ?? "";

  console.info("TELEGRAM MESSAGE UPDATE", {
    updateId: update.update_id,
    telegramId,
    hasContact: Boolean(message?.contact),
    hasLocation: Boolean(message?.location),
    text: text ? text.slice(0, 40) : "",
  });

  const lookup = await getUserLookupByTelegramId(telegramId);
  const session = await ensureOnboardingUser(telegramUser, lookup);

  if (text === "/start" || text.startsWith("/start ")) {
    await handleStart(String(chatId), session);
    return;
  }

  const { user } = session;

  if (user.registration_status === "completed") {
    await sendCompleted(String(chatId));
    return;
  }

  if (user.onboarding_step === "collecting_fio") {
    console.info("HANDLE STEP", { telegramId, step: "collecting_fio" });
    if (!text || !isValidFio(text)) {
      await sendTelegramMessage(String(chatId), "Укажите ФИО минимум из двух слов. Например: Иванов Иван");
      return;
    }

    const updated = await patchUser(user, { fio: text, onboarding_step: "collecting_phone" }, session.lookup);
    await sendStepPrompt(String(chatId), updated);
    return;
  }

  if (user.onboarding_step === "collecting_phone") {
    console.info("HANDLE STEP", { telegramId, step: "collecting_phone" });
    const contact = message?.contact;
    if (!contact?.phone_number || (contact.user_id && String(contact.user_id) !== telegramId)) {
      await sendTelegramMessage(String(chatId), "Отправьте свой номер телефона через кнопку ниже.", contactKeyboard());
      return;
    }

    const updated = await patchUser(user, { phone: contact.phone_number, onboarding_step: "collecting_location" }, session.lookup);
    await sendStepPrompt(String(chatId), updated);
    return;
  }

  if (user.onboarding_step === "collecting_location") {
    console.info("HANDLE STEP", { telegramId, step: "collecting_location" });
    const location = message?.location;
    if (typeof location?.latitude !== "number" || typeof location?.longitude !== "number") {
      await sendTelegramMessage(String(chatId), "Отправьте геолокацию через кнопку ниже.", locationKeyboard());
      return;
    }

    const updated = await patchUser(
      user,
      {
        geo_lat: String(location.latitude),
        geo_lng: String(location.longitude),
        onboarding_step: "collecting_position",
      },
      session.lookup,
    );
    await sendTelegramMessage(String(chatId), "Геолокация сохранена.", { remove_keyboard: true });
    await sendStepPrompt(String(chatId), updated);
    return;
  }

  await sendStepPrompt(String(chatId), user);
}

async function handleConfirm(chatId: string, user: AppUser, lookup: UserLookup | null) {
  console.info("CONFIRM CLICKED", { telegramId: user.telegram_id });

  if (!isProfileReadyForConfirm(user)) {
    await sendTelegramMessage(chatId, "Профиль заполнен не полностью. Давайте пройдем регистрацию заново.");
    await restartOnboarding(chatId, user, lookup);
    return;
  }

  try {
    await patchUser(user, { registration_status: "completed", onboarding_step: "completed" }, lookup);
  } catch (error) {
    logError("CONFIRM SAVE FAILED", error, { telegramId: user.telegram_id });
    await sendTelegramMessage(
      chatId,
      "Регистрация почти завершена, но возникла техническая ошибка. Попробуйте нажать «Подтвердить» еще раз через несколько секунд.",
      summaryKeyboard(),
    );
    return;
  }

  await sendMiniAppAccess(chatId, [
    "Регистрация завершена.",
    "",
    "Теперь Mini App будет автоматически использовать ваш профиль при создании заявок.",
  ]);
}

async function applyCallbackChoice(chatId: string, user: AppUser, data: string, lookup: UserLookup | null) {
  if (data === RESTART_CALLBACK) {
    await restartOnboarding(chatId, user, lookup);
    return;
  }

  if (data === CONFIRM_CALLBACK) {
    await handleConfirm(chatId, user, lookup);
    return;
  }

  const [prefix, field, rawIndex] = data.split(":");
  if (prefix !== "onboarding") {
    await sendStepPrompt(chatId, user);
    return;
  }

  const index = Number(rawIndex);
  if (!Number.isInteger(index)) {
    await sendStepPrompt(chatId, user);
    return;
  }

  if (field === "position") {
    const position = ONBOARDING_POSITIONS[index];
    if (!position) {
      await sendTelegramMessage(chatId, "Не удалось распознать должность. Выберите вариант еще раз.");
      await sendStepPrompt(chatId, user);
      return;
    }
    const updated = await patchUser(user, { position, onboarding_step: "collecting_department" }, lookup);
    await sendStepPrompt(chatId, updated);
    return;
  }

  if (field === "department") {
    const department = ONBOARDING_DEPARTMENTS[index];
    if (!department) {
      await sendTelegramMessage(chatId, "Не удалось распознать отдел. Выберите вариант еще раз.");
      await sendStepPrompt(chatId, user);
      return;
    }
    const updated = await patchUser(user, { department, onboarding_step: "collecting_office" }, lookup);
    await sendStepPrompt(chatId, updated);
    return;
  }

  if (field === "office") {
    const office = ONBOARDING_OFFICES[index];
    if (!office) {
      await sendTelegramMessage(chatId, "Не удалось распознать офис. Выберите вариант еще раз.");
      await sendStepPrompt(chatId, user);
      return;
    }
    const updated = await patchUser(
      user,
      {
        office_location: office,
        branch: office,
        onboarding_step: "completed",
        registration_status: "new",
      },
      lookup,
    );
    await sendTelegramMessage(chatId, formatProfileSummary(updated), summaryKeyboard());
    return;
  }

  await sendStepPrompt(chatId, user);
}

async function handleCallback(update: TelegramUpdate) {
  const callback = update.callback_query;
  const chatId = callback?.message?.chat.id;
  const from = callback?.from;
  const data = callback?.data ?? "";
  if (!callback || !chatId || !from?.id) return;

  console.info("TELEGRAM CALLBACK UPDATE", {
    updateId: update.update_id,
    telegramId: from.id,
  });
  console.info("CALLBACK DATA:", data);

  await answerTelegramCallbackQuery(callback.id);

  try {
    const lookup = await getUserLookupByTelegramId(String(from.id));
    const session = await ensureOnboardingUser(toTelegramUser(from), lookup);
    await applyCallbackChoice(String(chatId), session.user, data, session.lookup);
  } catch (error) {
    logError("TELEGRAM CALLBACK FAILED", error, { telegramId: from.id, data });
    await sendTelegramMessage(
      String(chatId),
      "Возникла техническая ошибка при обработке кнопки. Попробуйте еще раз через несколько секунд.",
    );
  }
}

async function sendUnhandledErrorToUser(update: TelegramUpdate | null, error: unknown) {
  const chatId = update?.callback_query?.message?.chat.id ?? update?.message?.chat.id;
  if (!chatId) return;

  logError("TELEGRAM WEBHOOK HANDLER FAILED", error, { chatId });
  await sendTelegramMessage(
    String(chatId),
    "Возникла техническая ошибка. Попробуйте еще раз через несколько секунд.",
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let update: TelegramUpdate | null = null;

  console.info("TELEGRAM WEBHOOK RECEIVED");

  try {
    update = (await request.json()) as TelegramUpdate;

    if (update.callback_query) {
      await handleCallback(update);
      return jsonOk({ handled: true, type: "callback_query" });
    }

    if (update.message) {
      await handleMessage(update);
      return jsonOk({ handled: true, type: "message" });
    }

    console.info("TELEGRAM WEBHOOK UNHANDLED UPDATE", { updateId: update.update_id });
    return jsonOk({ handled: false });
  } catch (error) {
    await sendUnhandledErrorToUser(update, error);
    return jsonOk({
      handled: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка webhook",
    });
  } finally {
    console.info("TOTAL WEBHOOK DURATION MS", Date.now() - startedAt);
  }
}
