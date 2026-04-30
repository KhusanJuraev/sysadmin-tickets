import crypto from "crypto";

export type AdminSession = {
  username: string;
  expiresAt: number;
};

export const ADMIN_COOKIE_NAME = "mmm_admin_session";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getAdminUsername() {
  return process.env.ADMIN_USERNAME ?? "admin";
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

function getAdminSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.INIT_SECRET || "development-admin-secret";
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getAdminSecret()).update(payload).digest("base64url");
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function isHttpsRequest(request: Request) {
  if (new URL(request.url).protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
}

export function validateAdminCredentials(username: string, password: string) {
  const expectedPassword = getAdminPassword();
  if (!expectedPassword) return false;
  return username === getAdminUsername() && password === expectedPassword;
}

export function createAdminSessionToken(username: string) {
  const session: AdminSession = {
    username,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export function readAdminSession(request: Request): AdminSession | null {
  const token = parseCookies(request)[ADMIN_COOKIE_NAME];
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !timingSafeEqual(sign(payload), signature)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
    if (!session.username || !session.expiresAt || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function requireAdminSession(request: Request) {
  const session = readAdminSession(request);
  if (!session) {
    const error = new Error("Требуется вход в админ-панель");
    error.name = "AdminUnauthorizedError";
    throw error;
  }
  return session;
}

export function adminCookieHeader(request: Request, token: string) {
  const secure = isHttpsRequest(request) ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearAdminCookieHeader(request: Request) {
  const secure = isHttpsRequest(request) ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}
