"use client";

import { useEffect, useMemo, useState } from "react";
import { ROLE_LABELS } from "@/config/app";
import { Button } from "@/components/ui/button";
import { HomeDashboard } from "@/components/app/home-dashboard";
import { RequestWizard } from "@/components/app/request-wizard";
import { MyRequests } from "@/components/app/my-requests";
import { apiFetch, ApiClientError } from "@/components/app/client-api";
import type { AppUser, TelegramUser } from "@/types";

type MeResponse = {
  user: AppUser;
  telegramUser: TelegramUser;
  googleConfigured: boolean;
};

type Tab = "home" | "new" | "mine";

const AUTH_BOOT_TIMEOUT_MS = 15000;

const NAV_LABELS: Record<Tab, string> = {
  home: "Главная",
  new: "Создать",
  mine: "Заявки",
};

const NAV_ICONS: Record<Tab, string> = {
  home: "⌂",
  new: "+",
  mine: "≡",
};

function valueOrEmpty(value?: string | number | null) {
  return value ? String(value) : "Не заполнено";
}

function getInitials(user: AppUser | null, telegramUser: TelegramUser | null) {
  const first = telegramUser?.first_name?.trim();
  const last = telegramUser?.last_name?.trim();
  if (first || last) return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();

  const parts = (user?.fio || user?.username || "Пользователь")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return `${parts[0]?.[0] ?? "П"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function ProfileRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="profile-row">
      <p className="meta-label text-zinc-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-zinc-950">{valueOrEmpty(value)}</p>
    </div>
  );
}

export function MiniApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [user, setUser] = useState<AppUser | null>(null);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [bootStarted, setBootStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profileRequired, setProfileRequired] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      console.error("AUTH BOOT ERROR", { message: "Таймаут запроса /api/me" });
      controller.abort();
    }, AUTH_BOOT_TIMEOUT_MS);

    function setLoadingState(value: boolean) {
      console.info("loading state transition", { loading: value });
      if (active) setLoading(value);
    }

    async function boot() {
      console.info("AUTH BOOT START", {
        hasTelegramWebApp: Boolean(window.Telegram?.WebApp),
        hasInitData: Boolean(window.Telegram?.WebApp?.initData),
      });
      if (active) setBootStarted(true);
      setLoadingState(true);
      setError("");
      setProfileRequired(false);

      try {
        try {
          window.Telegram?.WebApp?.ready();
          window.Telegram?.WebApp?.expand();
        } catch (telegramError) {
          console.warn("AUTH BOOT TELEGRAM WEBAPP INIT FAILED", telegramError);
        }

        const data = await apiFetch<MeResponse>("/api/me", { signal: controller.signal });
        console.info("AUTH BOOT RESPONSE", {
          hasUser: Boolean(data.user),
          telegramId: data.telegramUser?.id,
          registrationStatus: data.user?.registration_status,
          googleConfigured: data.googleConfigured,
        });

        if (!active) return;
        if (!data.user || !data.telegramUser) {
          throw new Error("API профиля вернул неполные данные");
        }
        setUser(data.user);
        setTelegramUser(data.telegramUser);
        setGoogleConfigured(data.googleConfigured);
        console.info("AUTH BOOT SUCCESS", { telegramId: data.telegramUser?.id });
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "Не удалось загрузить профиль: превышено время ожидания"
            : err instanceof Error
              ? err.message
              : "Не удалось загрузить профиль";
        console.error("AUTH BOOT ERROR", {
          message,
          code: err instanceof ApiClientError ? err.code : undefined,
        });

        if (err instanceof ApiClientError && err.code === "PROFILE_NOT_COMPLETED") {
          setProfileRequired(true);
          return;
        }
        setError(message);
      } finally {
        window.clearTimeout(timeout);
        console.info("AUTH BOOT FINISH");
        setLoadingState(false);
      }
    }

    void boot();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const activeTab = tab;

  const tabs = useMemo(
    () =>
      [
        { id: "home" as const, label: NAV_LABELS.home },
        { id: "mine" as const, label: NAV_LABELS.mine },
        { id: "new" as const, label: NAV_LABELS.new },
      ] as Array<{ id: Tab; label: string }>,
    [],
  );

  function handleCreated() {
    setRefreshToken((value) => value + 1);
  }

  const profileName = user?.fio || user?.username || "Пользователь";
  const profileInitials = getInitials(user, telegramUser);
  const contentWidth = "max-w-3xl";
  const topbarWidth = "";
  const appReady = Boolean(user) && !error && !profileRequired;
  const showBootLoading = bootStarted && loading && !user && !error && !profileRequired;

  return (
    <main className="app-shell min-h-screen text-zinc-950">
      <div className={`app-container mx-auto grid ${contentWidth}`}>
        <header className={`top-surface app-topbar ${topbarWidth} flex min-h-16 items-center justify-between gap-3 px-4`}>
          <button
            onClick={() => {
              setProfileOpen(false);
              setTab("home");
            }}
            className="focus-ring flex min-w-0 items-center gap-3 rounded-xl text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-[10px] font-black text-white shadow-[0_8px_18px_rgba(5,150,105,.20)]">
              МММ
            </span>
            <span className="min-w-0">
              <span className="app-title block truncate text-zinc-950">Заявка в технический отдел</span>
            </span>
          </button>

          {user ? (
            <div className="relative">
              <button
                className="focus-ring profile-trigger"
                onClick={() => setProfileOpen((value) => !value)}
                type="button"
                aria-expanded={profileOpen}
                aria-label="Открыть профиль"
              >
                {profileInitials}
              </button>

              {profileOpen ? (
                <div className="profile-card absolute right-0 top-[calc(100%+10px)]">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="profile-trigger h-11 w-11 text-[14px]">{profileInitials}</span>
                    <div className="min-w-0">
                      <p className="section-title truncate text-zinc-950">{profileName}</p>
                      <p className="meta-text text-emerald-700">{ROLE_LABELS[user.role]}</p>
                    </div>
                  </div>

                  <ProfileRow label="Ф.И.О" value={user.fio} />
                  <ProfileRow label="Телефон" value={user.phone} />
                  <ProfileRow label="Telegram ID" value={user.telegram_id || telegramUser?.id} />
                  <ProfileRow label="Аккаунт Telegram" value={user.username || telegramUser?.username} />
                  <ProfileRow label="Должность" value={user.position} />
                  <ProfileRow label="Отдел" value={user.department} />
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        {profileOpen ? (
          <button
            className="fixed inset-0 z-[900] cursor-default"
            type="button"
            aria-label="Закрыть профиль"
            onClick={() => setProfileOpen(false)}
          />
        ) : null}

        {!googleConfigured ? (
          <div className="soft-alert p-4 text-sm leading-6">
            Google Sheets еще не подключен. Интерфейс доступен, но отправка и список заявок заработают после настройки
            переменных окружения и инициализации таблицы.
          </div>
        ) : null}

        {showBootLoading ? <section className="premium-card text-sm text-zinc-500">Загрузка Mini App...</section> : null}

        {!bootStarted && !appReady && !error && !profileRequired ? (
          <section className="premium-card text-sm text-zinc-500">
            Запускаем Mini App...
          </section>
        ) : null}

        {profileRequired ? (
          <section className="premium-card text-center">
            <p className="eyebrow">{"\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f"}</p>
            <h1 className="screen-title mt-3 text-zinc-950">{"\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044e \u0432 Telegram"}</h1>
            <p className="body-copy mx-auto mt-3 max-w-md">
              {"\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0431\u043e\u0442, \u043d\u0430\u0436\u043c\u0438\u0442\u0435 /start \u0438 \u043f\u0440\u043e\u0439\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u043e\u0442\u043a\u0443\u044e \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044e. \u041f\u043e\u0441\u043b\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f \u043f\u0440\u043e\u0444\u0438\u043b\u044f Mini App \u043e\u0442\u043a\u0440\u043e\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f \u043a \u0437\u0430\u044f\u0432\u043a\u0430\u043c."}
            </p>
            <Button className="mt-5" onClick={() => window.location.reload()}>
              {"\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0441\u043d\u043e\u0432\u0430"}
            </Button>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-xl bg-rose-50 p-5 shadow-[0_6px_16px_rgba(225,29,72,.06)]">
            <p className="text-sm font-semibold text-rose-800">Не удалось открыть Mini App</p>
            <p className="mt-2 text-sm text-rose-700">{error}</p>
            <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>
              Обновить
            </Button>
          </section>
        ) : null}

        {appReady ? (
          <>
            {activeTab === "home" ? (
              <HomeDashboard onNavigate={setTab} refreshToken={refreshToken} />
            ) : null}
            {activeTab === "new" ? <RequestWizard user={user} telegramUser={telegramUser} onCreated={handleCreated} /> : null}
            {activeTab === "mine" ? <MyRequests refreshToken={refreshToken} /> : null}
          </>
        ) : null}
      </div>

      {appReady ? (
        <nav className="mobile-nav" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setProfileOpen(false);
                setTab(item.id);
              }}
              className={`focus-ring nav-item flex flex-col items-center justify-center gap-0.5 ${activeTab === item.id ? "nav-item-active" : ""}`}
            >
              <span className="text-[15px] leading-none">{NAV_ICONS[item.id]}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
