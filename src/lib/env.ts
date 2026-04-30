import { APP_CONFIG } from "@/config/app";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new ConfigurationError(`Не задана переменная окружения ${name}`);
  }
  return value;
}

function optional(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export function getGoogleConfig() {
  return {
    spreadsheetId: required("GOOGLE_SHEETS_ID"),
    serviceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    driveParentFolderId: optional("GOOGLE_DRIVE_PARENT_FOLDER_ID"),
  };
}

export function getGoogleOAuthConfig() {
  return {
    clientId: required("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirectUri: required("GOOGLE_OAUTH_REDIRECT_URI"),
    driveParentFolderId: optional("GOOGLE_DRIVE_PARENT_FOLDER_ID"),
    tokenFile: optional("GOOGLE_OAUTH_TOKEN_FILE", ".data/google-drive-oauth.json"),
  };
}

export function getTelegramConfig() {
  return {
    botToken: optional("TELEGRAM_BOT_TOKEN"),
    marketingChatId: optional("TELEGRAM_MARKETING_CHAT_ID"),
    marketingUserIds: optional("TELEGRAM_MARKETING_IDS")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    marketingHeadUserIds: optional("TELEGRAM_MARKETING_HEAD_IDS")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    initDataMaxAgeSeconds: Number(optional("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "86400")),
  };
}

export function getRuntimeConfig() {
  return {
    appUrl: optional("NEXT_PUBLIC_APP_URL", `http://localhost:${APP_CONFIG.localPort}`),
    initSecret: optional("INIT_SECRET"),
    allowDevAuth:
      process.env.NODE_ENV !== "production" && optional("ALLOW_DEV_AUTH", "true").toLowerCase() !== "false",
    maxUploadBytes: Number(optional("MAX_UPLOAD_MB", String(APP_CONFIG.maxUploadMb))) * 1024 * 1024,
  };
}

export function getSupabaseStorageConfig() {
  return {
    url: required("SUPABASE_URL").replace(/\/$/, ""),
    anonKey: required("SUPABASE_ANON_KEY"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: optional("SUPABASE_STORAGE_BUCKET", "request-attachments"),
  };
}

export function isSupabaseStorageConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      (process.env.SUPABASE_STORAGE_BUCKET || "request-attachments"),
  );
}

export function isGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEETS_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  );
}
