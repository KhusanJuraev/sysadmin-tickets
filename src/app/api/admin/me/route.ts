import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requireAdminSession(request);
    return jsonOk({ username: session.username, expiresAt: session.expiresAt });
  } catch {
    return Response.json(
      { ok: false, error: { message: "Требуется вход в админ-панель", code: "ADMIN_UNAUTHORIZED" } },
      { status: 401 },
    );
  }
}
