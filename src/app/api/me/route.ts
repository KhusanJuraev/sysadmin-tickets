import { jsonError, jsonOk } from "@/lib/api-response";
import { getAuthContext, ProfileNotCompletedError } from "@/lib/auth-context";
import { isGoogleConfigured } from "@/lib/env";
import { buildDefaultAppUser, getDevAuthContext, getTelegramInitData, validateTelegramInitData } from "@/lib/telegram/auth";

export const runtime = "nodejs";

function profileNotCompletedResponse() {
  return Response.json(
    {
      ok: false,
      error: {
        message: "Сначала завершите регистрацию в Telegram",
        code: "PROFILE_NOT_COMPLETED",
      },
    },
    { status: 403 },
  );
}

export async function GET(request: Request) {
  try {
    if (!isGoogleConfigured()) {
      const initData = getTelegramInitData(request);
      const dev = !initData ? getDevAuthContext(request) : null;
      const telegramUser = initData ? validateTelegramInitData(initData) : dev?.telegramUser;
      if (!telegramUser) throw new Error("Нет Telegram initData");
      return jsonOk({
        user: dev?.appUser ?? buildDefaultAppUser(telegramUser),
        telegramUser,
        googleConfigured: false,
      });
    }

    const context = await getAuthContext(request);
    return jsonOk({
      user: context.appUser,
      telegramUser: context.telegramUser,
      googleConfigured: true,
    });
  } catch (error) {
    if (error instanceof ProfileNotCompletedError) return profileNotCompletedResponse();
    return jsonError(error, 401);
  }
}
