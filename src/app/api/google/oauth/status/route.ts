import { jsonError, jsonOk } from "@/lib/api-response";
import { requireAdminSession } from "@/lib/admin-auth";
import { getDriveOAuthStatus } from "@/lib/google/oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requireAdminSession(request);
    return jsonOk(await getDriveOAuthStatus());
  } catch (error) {
    return jsonError(error, 401);
  }
}
