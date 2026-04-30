import { jsonError, jsonOk } from "@/lib/api-response";
import { readAdminSession } from "@/lib/admin-auth";
import { getAuthContext } from "@/lib/auth-context";
import { getHistoryByRequestId, getRequestById } from "@/lib/repositories";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { requestId } = await context.params;
    const item = await getRequestById(requestId);

    if (!item) return jsonError(new Error("Заявка не найдена"), 404);

    if (readAdminSession(request)) {
      return jsonOk({ request: item, history: await getHistoryByRequestId(requestId) });
    }

    const auth = await getAuthContext(request);
    if (item.telegram_id !== auth.appUser.telegram_id) {
      return jsonError(new Error("Нет доступа к этой заявке"), 403);
    }

    return jsonOk({ request: item, history: await getHistoryByRequestId(requestId) });
  } catch (error) {
    return jsonError(error, 401);
  }
}
