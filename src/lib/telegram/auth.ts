import crypto from "crypto";
import { getTelegramConfig, getRuntimeConfig } from "@/lib/env";
import type { AppUser, AuthContext, TelegramUser, UserRole } from "@/types";

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  return { params, hash, dataCheckString };
}

export function validateTelegramInitData(initData: string) {
  const { botToken, initDataMaxAgeSeconds } = getTelegramConfig();
  if (!botToken) {
    throw new Error("Не задан TELEGRAM_BOT_TOKEN");
  }

  const { params, hash, dataCheckString } = parseInitData(initData);
  if (!hash) throw new Error("Telegram initData не содержит hash");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) {
    throw new Error("Telegram initData не прошел проверку подписи");
  }

  const authDate = Number(params.get("auth_date") ?? "0");
  if (authDate && Date.now() / 1000 - authDate > initDataMaxAgeSeconds) {
    throw new Error("Telegram initData устарел");
  }

  const user = JSON.parse(params.get("user") ?? "{}") as TelegramUser;
  if (!user.id) throw new Error("Telegram initData не содержит пользователя");

  return user;
}

function roleFromEnv(telegramId: string): UserRole {
  const config = getTelegramConfig();
  if (config.marketingHeadUserIds.includes(telegramId)) return "marketing_head";
  if (config.marketingUserIds.includes(telegramId)) return "marketing";
  return "employee";
}

export function buildDefaultAppUser(telegramUser: TelegramUser): AppUser {
  const telegramId = String(telegramUser.id);
  const now = new Date().toISOString();
  return {
    telegram_id: telegramId,
    username: telegramUser.username ?? "",
    telegram_first_name: telegramUser.first_name ?? "",
    telegram_last_name: telegramUser.last_name ?? "",
    fio: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" "),
    phone: "",
    position: "",
    department: "",
    branch: "",
    office_location: "",
    geo_lat: "",
    geo_lng: "",
    registration_status: "new",
    onboarding_step: "collecting_fio",
    created_at: now,
    updated_at: now,
    role: roleFromEnv(telegramId),
    is_active: true,
  };
}

function getHeader(request: Request, name: string) {
  return request.headers.get(name) ?? request.headers.get(name.toLowerCase()) ?? "";
}

function isLocalDevRequest(request: Request) {
  try {
    const hostname = new URL(request.url).hostname;
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
  } catch {
    const host = getHeader(request, "host").split(":")[0];
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host);
  }
}

export function getTelegramInitData(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("tma ")) return auth.slice(4);
  return getHeader(request, "x-telegram-init-data");
}

export function getDevAuthContext(request: Request): AuthContext | null {
  if (!getRuntimeConfig().allowDevAuth) return null;
  if (!isLocalDevRequest(request)) {
    console.warn("DEV AUTH REJECTED", { reason: "non-local request", url: request.url });
    return null;
  }
  const id = getHeader(request, "x-dev-telegram-id") || "100001";
  const username = getHeader(request, "x-dev-telegram-username") || "dev_user";
  const role = (getHeader(request, "x-dev-role") as UserRole) || roleFromEnv(id);
  const telegramUser: TelegramUser = {
    id: Number(id),
    first_name: "Локальный",
    last_name: "Пользователь",
    username,
  };
  return {
    telegramUser,
    appUser: {
      ...buildDefaultAppUser(telegramUser),
      fio: "Локальный Пользователь",
      phone: "+998901234567",
      position: "Сотрудник офиса",
      department: "Технический отдел",
      branch: "Головной офис",
      office_location: "Головной офис",
      registration_status: "completed",
      onboarding_step: "completed",
      role,
    },
    initData: "",
    isDevAuth: true,
  };
}

export function assertMarketingRole(role: UserRole) {
  if (role !== "marketing" && role !== "marketing_head") {
    throw new Error("Недостаточно прав для панели маркетинга");
  }
}
