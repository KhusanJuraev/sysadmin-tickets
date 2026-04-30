import { jsonError, jsonOk } from "@/lib/api-response";
import { requireAdminSession } from "@/lib/admin-auth";
import { buildGoogleOAuthUrl, createOAuthState } from "@/lib/google/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = requireAdminSession(request);
    const state = createOAuthState(admin.username, "marketing_head");
    return jsonOk({ authUrl: buildGoogleOAuthUrl(state) });
  } catch (error) {
    return jsonError(error, 401);
  }
}
