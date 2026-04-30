import { jsonOk } from "@/lib/api-response";
import { adminCookieHeader, createAdminSessionToken, validateAdminCredentials } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (!validateAdminCredentials(username, password)) {
    return Response.json(
      { ok: false, error: { message: "Неверный логин или пароль", code: "ADMIN_UNAUTHORIZED" } },
      { status: 401 },
    );
  }

  const token = createAdminSessionToken(username);
  return jsonOk(
    { username },
    {
      headers: {
        "Set-Cookie": adminCookieHeader(request, token),
      },
    },
  );
}
