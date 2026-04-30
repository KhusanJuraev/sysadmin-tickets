import { getUserByTelegramId } from "@/lib/repositories";
import {
  buildDefaultAppUser,
  getDevAuthContext,
  getTelegramInitData,
  validateTelegramInitData,
} from "@/lib/telegram/auth";
import type { AppUser, AuthContext, UserRole } from "@/types";

function strongerRole(primary: UserRole, fallback: UserRole): UserRole {
  const rank: Record<UserRole, number> = {
    employee: 1,
    marketing: 2,
    marketing_head: 3,
  };
  return rank[primary] >= rank[fallback] ? primary : fallback;
}

export class ProfileNotCompletedError extends Error {
  code = "PROFILE_NOT_COMPLETED";

  constructor() {
    super("Сначала завершите регистрацию в Telegram");
    this.name = "ProfileNotCompletedError";
  }
}

export function isProfileCompleted(user: AppUser | null | undefined) {
  return Boolean(
    user &&
      user.registration_status === "completed" &&
      user.fio &&
      user.phone &&
      user.position &&
      user.department &&
      (user.office_location || user.branch),
  );
}

type AuthContextOptions = {
  requireCompletedProfile?: boolean;
};

export async function getAuthContext(
  request: Request,
  options: AuthContextOptions = {},
): Promise<AuthContext> {
  const initData = getTelegramInitData(request);
  const requireCompletedProfile = options.requireCompletedProfile ?? true;

  if (!initData) {
    const dev = getDevAuthContext(request);
    if (dev) return dev;
    throw new Error("Нет Telegram initData");
  }

  const telegramUser = validateTelegramInitData(initData);
  const fallbackUser = buildDefaultAppUser(telegramUser);
  const storedUser = await getUserByTelegramId(String(telegramUser.id));

  if (storedUser && !storedUser.is_active) {
    throw new Error("Пользователь отключен");
  }

  const appUser = storedUser
    ? {
        ...fallbackUser,
        ...storedUser,
        role: strongerRole(storedUser.role, fallbackUser.role),
        is_active: storedUser.is_active,
      }
    : fallbackUser;

  if (requireCompletedProfile && !isProfileCompleted(appUser)) {
    throw new ProfileNotCompletedError();
  }

  return {
    telegramUser,
    appUser,
    initData,
    isDevAuth: false,
  };
}
