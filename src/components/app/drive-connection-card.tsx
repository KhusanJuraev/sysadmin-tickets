"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/components/app/client-api";

type DriveStatus = {
  connected: boolean;
  email: string;
  connectedAt: string;
  lastTokenRefreshAt: string;
};

export function DriveConnectionCard() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch<DriveStatus>("/api/google/oauth/status")
      .then(setStatus)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch<{ authUrl: string }>("/api/google/oauth/start", { method: "POST" });
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось начать подключение Google Drive");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/google/oauth/disconnect", { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить Google Drive");
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.connected);

  return (
    <section className="route-card overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Вложения</p>
          <h3 className="section-title mt-2 text-zinc-950">Google Drive для файлов</h3>
          <p className="body-copy mt-2 max-w-2xl">
            Файлы заявок сохраняются через подключенный Google-аккаунт маркетинга. Реестр заявок продолжает работать
            через Google Sheets отдельно.
          </p>
        </div>
        <span
          className={`meta-label shrink-0 rounded-full border px-3 py-1.5 font-bold ${
            connected
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {loading ? "Проверяем" : connected ? "Подключено" : "Не подключено"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="rounded-xl bg-zinc-50/80 p-4 shadow-[0_6px_16px_rgba(15,23,42,.035)]">
          {connected ? (
            <>
              <p className="meta-label text-zinc-400">Аккаунт Drive</p>
              <p className="mt-2 truncate text-sm font-semibold leading-6 text-zinc-950">
                {status?.email || "Google-аккаунт подключен"}
              </p>
              {status?.connectedAt ? (
                <p className="meta-text mt-2">Подключено: {status.connectedAt}</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="section-title text-amber-950">Drive пока не подключен</p>
              <p className="body-copy mt-2 text-amber-800">
                Заявки будут создаваться, но вложения не загрузятся в Drive до подключения аккаунта.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button onClick={connect} disabled={busy}>
            {connected ? "Переподключить" : "Подключить Drive"}
          </Button>
          {connected ? (
            <Button variant="secondary" onClick={disconnect} disabled={busy}>
              Отключить
            </Button>
          ) : null}
          <Button variant="ghost" onClick={load} disabled={busy}>
            Обновить
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
