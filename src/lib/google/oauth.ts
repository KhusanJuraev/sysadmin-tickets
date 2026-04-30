import crypto from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { getGoogleOAuthConfig, getRuntimeConfig } from "@/lib/env";
import { nowIso } from "@/lib/datetime";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export const DRIVE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export type DriveOAuthTokenStorage = {
  refresh_token: string;
  connected_google_email: string;
  connected_at: string;
  last_token_refresh_at: string;
};

type OAuthState = {
  nonce: string;
  telegramId: string;
  role: string;
  exp: number;
};

function getStateSecret() {
  const runtime = getRuntimeConfig();
  const oauth = getGoogleOAuthConfig();
  return runtime.initSecret || process.env.TELEGRAM_BOT_TOKEN || oauth.clientSecret;
}

function getTokenFilePath() {
  const configured = getGoogleOAuthConfig().tokenFile;
  const fileName = path.basename(configured || "google-drive-oauth.json");
  return path.join(process.cwd(), ".data", fileName);
}

function signStatePayload(payload: string) {
  return crypto.createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function createOAuthState(telegramId: string, role: string) {
  const payload: OAuthState = {
    nonce: crypto.randomUUID(),
    telegramId,
    role,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signStatePayload(encoded)}`;
}

export function verifyOAuthState(state: string) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new Error("Некорректный OAuth state");

  const expected = signStatePayload(encoded);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("OAuth state не прошел проверку подписи");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
  if (payload.exp < Date.now()) throw new Error("OAuth state устарел");
  return payload;
}

export function buildGoogleOAuthUrl(state: string) {
  const config = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: DRIVE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string) {
  const config = getGoogleOAuthConfig();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth не выдал token response: ${await response.text()}`);
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

async function fetchConnectedEmail(accessToken: string) {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return "";
  const data = (await response.json()) as { email?: string };
  return data.email ?? "";
}

export async function readDriveOAuthToken() {
  try {
    const raw = await readFile(getTokenFilePath(), "utf8");
    const token = JSON.parse(raw) as DriveOAuthTokenStorage;
    return token.refresh_token ? token : null;
  } catch {
    return null;
  }
}

export async function saveDriveOAuthToken(token: DriveOAuthTokenStorage) {
  const filePath = getTokenFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(token, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function clearDriveOAuthToken() {
  await rm(getTokenFilePath(), { force: true });
}

export async function completeGoogleOAuth(code: string) {
  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) {
    throw new Error("Google не вернул refresh token. Нажмите «Переподключить» и подтвердите доступ повторно.");
  }

  const email = await fetchConnectedEmail(tokens.access_token);
  const now = nowIso();
  const saved: DriveOAuthTokenStorage = {
    refresh_token: tokens.refresh_token,
    connected_google_email: email,
    connected_at: now,
    last_token_refresh_at: now,
  };
  await saveDriveOAuthToken(saved);
  return saved;
}

export async function getDriveOAuthStatus() {
  const token = await readDriveOAuthToken();
  return {
    connected: Boolean(token?.refresh_token),
    email: token?.connected_google_email ?? "",
    connectedAt: token?.connected_at ?? "",
    lastTokenRefreshAt: token?.last_token_refresh_at ?? "",
  };
}

export async function getDriveUserAccessToken() {
  const saved = await readDriveOAuthToken();
  if (!saved?.refresh_token) {
    throw new Error("Google Drive не подключен. Подключите аккаунт в панели маркетинга.");
  }

  const config = getGoogleOAuthConfig();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: saved.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Не удалось обновить Google Drive access token: ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  await saveDriveOAuthToken({
    ...saved,
    last_token_refresh_at: nowIso(),
  });
  return data.access_token;
}
