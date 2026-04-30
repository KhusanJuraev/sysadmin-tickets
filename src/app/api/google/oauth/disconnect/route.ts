import { jsonError, jsonOk } from "@/lib/api-response";
import { requireAdminSession } from "@/lib/admin-auth";
import { clearDriveOAuthToken } from "@/lib/google/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireAdminSession(request);
    await clearDriveOAuthToken();
    return jsonOk({ disconnected: true });
  } catch (error) {
    return jsonError(error, 401);
  }
}
