"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DICTIONARIES } from "@/config/dictionaries";
import { REQUEST_STATUSES } from "@/config/statuses";
import { Button } from "@/components/ui/button";
import { SelectInput, TextArea, TextInput } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { RequestDetails } from "@/components/app/request-details";
import { apiFetch, ApiClientError } from "@/components/app/client-api";
import type { AttachmentMeta, MarketingRequest, RequestStatus } from "@/types";

type AdminSession = {
  username: string;
  expiresAt: number;
};

type Filters = {
  search: string;
  status: string;
  branch: string;
  category: string;
};

const emptyFilters: Filters = {
  search: "",
  status: "",
  branch: "",
  category: "",
};

const ADMIN_STATUS_OPTIONS: Array<{ status: RequestStatus; label: string; tone: string }> = [
  { status: "new", label: "Новая", tone: "admin-stat-slate" },
  { status: "accepted", label: "Принята", tone: "admin-stat-green" },
  { status: "in_review", label: "Анализ", tone: "admin-stat-blue" },
  { status: "on_approval", label: "Согласование", tone: "admin-stat-violet" },
  { status: "in_production", label: "В работе", tone: "admin-stat-green" },
  { status: "ready_to_send", label: "Отправка", tone: "admin-stat-amber" },
  { status: "completed", label: "Готово", tone: "admin-stat-mint" },
  { status: "rejected", label: "Отклонена", tone: "admin-stat-rose" },
];

const ADMIN_STATUS_ACTIONS = ADMIN_STATUS_OPTIONS.filter((item) => item.status !== "new");

const ADMIN_CATEGORIES = Array.from(
  new Set([...Object.keys(DICTIONARIES.materialCategories), ...Object.keys(DICTIONARIES.serviceCategories)]),
);

function parseAttachments(value: string) {
  try {
    return value ? (JSON.parse(value) as AttachmentMeta[]) : [];
  } catch {
    return [];
  }
}

function requestText(item: MarketingRequest) {
  return item.requirements || item.description || "";
}

function quantityLabel(item: MarketingRequest) {
  return `${item.quantity || ""} ${item.unit || ""}`.trim();
}

function AdminStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`admin-stat ${tone}`}>
      <p className="admin-stat-value">{value}</p>
      <p className="admin-stat-label">{label}</p>
    </div>
  );
}

function AdminLogin({ onLoggedIn }: { onLoggedIn: (session: AdminSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch<{ username: string }>("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const session = await apiFetch<AdminSession>("/api/admin/me");
      onLoggedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-shell admin-login-shell">
      <section className="admin-login-card">
        <div>
          <p className="admin-eyebrow">MMM Admin</p>
          <h1 className="admin-title mt-3">Панель управления заявками</h1>
          <p className="admin-muted mt-3">
            Отдельный кабинет для обработки очереди маркетинга, статусов, комментариев и интеграций.
          </p>
        </div>

        <form className="mt-8 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2">
            <span className="admin-label">Логин</span>
            <TextInput value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label className="grid gap-2">
            <span className="admin-label">Пароль</span>
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

          <Button className="min-h-12" disabled={loading}>
            {loading ? "Входим..." : "Войти"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function AdminQueue({ session, onLogout }: { session: AdminSession; onLogout: () => void }) {
  const [items, setItems] = useState<MarketingRequest[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedStatus, setSelectedStatus] = useState<RequestStatus>("new");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState<"status" | "comment" | RequestStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ requests: MarketingRequest[] }>("/api/requests?scope=all");
      setItems(data.requests);
      if (selected && !data.requests.some((item) => item.request_id === selected)) setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedItem = useMemo(() => items.find((item) => item.request_id === selected) ?? null, [items, selected]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      statuses: ADMIN_STATUS_OPTIONS.map((status) => ({
        ...status,
        value: items.filter((item) => item.current_status === status.status).length,
      })),
    };
  }, [items]);

  const statusFilterOptions = useMemo(() => {
    const known = new Set(ADMIN_STATUS_OPTIONS.map((status) => status.status));
    const legacyStatuses = REQUEST_STATUSES.filter(
      (status) => !known.has(status.value) && items.some((item) => item.current_status === status.value),
    ).map((status) => ({
      status: status.value,
      label: status.label,
    }));

    return [...ADMIN_STATUS_OPTIONS, ...legacyStatuses];
  }, [items]);

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return items.filter((item) => {
      const haystack = [
        item.request_id,
        item.requester_fio,
        item.item_name,
        item.description,
        item.requirements,
        item.branch,
        item.department,
        item.category,
        item.subcategory,
        item.phone,
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!query || haystack.includes(query)) &&
        (!filters.status || item.current_status === filters.status) &&
        (!filters.branch || item.branch === filters.branch) &&
        (!filters.category || item.category === filters.category)
      );
    });
  }, [filters, items]);

  async function sendStatus(status: RequestStatus, mode: "status" | RequestStatus = "status") {
    if (!selectedItem) return;
    setChanging(mode);
    setError("");
    try {
      await apiFetch(`/api/requests/${selectedItem.request_id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment, assigned_marketing_user: session.username }),
      });
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить статус");
    } finally {
      setChanging(null);
    }
  }

  async function sendComment() {
    if (!selectedItem || !comment.trim()) return;
    setChanging("comment");
    setError("");
    try {
      await apiFetch(`/api/requests/${selectedItem.request_id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment, assigned_marketing_user: session.username }),
      });
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить комментарий");
    } finally {
      setChanging(null);
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="flex items-center gap-3">
          <span className="admin-logo">TECH</span>
          <div>
            <p className="admin-sidebar-title">System Admin</p>
            <p className="admin-sidebar-muted">TURON TELECOM</p>
          </div>
        </div>

        <div className="admin-sidebar-block">
          <p className="admin-sidebar-muted">Администратор</p>
          <p className="truncate text-sm font-bold text-zinc-950">{session.username}</p>
        </div>

        <button className="admin-sidebar-button" onClick={onLogout}>
          Выйти
        </button>
      </aside>

      <section className="admin-main">
        <div className="admin-hero">
          <div>
            <p className="admin-eyebrow">Операционный центр</p>
            <h1 className="admin-title mt-2">Очередь заявок технического отдела</h1>
            <p className="admin-muted mt-2">
              Все входящие заявки, комментарии, вложения и статусы для живой обработки.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            Обновить
          </Button>
        </div>

        <div className="admin-stats">
          <AdminStat label="Всего" value={stats.total} tone="admin-stat-slate" />
          {stats.statuses.map((status) => (
            <AdminStat key={status.status} label={status.label} value={status.value} tone={status.tone} />
          ))}
        </div>

        <div className="admin-card admin-filter-card">
          <div className="admin-filter-grid">
            <TextInput
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Поиск по номеру, заявителю, филиалу или требованию"
            />
            <SelectInput value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Все статусы</option>
              {statusFilterOptions.map((status) => (
                <option key={status.status} value={status.status}>
                  {status.label}
                </option>
              ))}
            </SelectInput>
            <SelectInput value={filters.branch} onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value }))}>
              <option value="">Все филиалы</option>
              {DICTIONARIES.branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </SelectInput>
            <SelectInput value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">Все категории</option>
              {ADMIN_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </SelectInput>
            <Button className="admin-filter-reset" variant="ghost" onClick={() => setFilters(emptyFilters)}>
              Сбросить
            </Button>
          </div>
        </div>

        {error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}

        <div className="admin-workspace">
          <div className="admin-card admin-list">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="section-title text-zinc-950">Заявки</h2>
              <span className="meta-label rounded-full bg-zinc-100 px-3 py-1 text-zinc-500">
                {filtered.length} из {items.length}
              </span>
            </div>

            {loading ? <p className="body-copy rounded-xl bg-zinc-50 p-4">Загружаем очередь...</p> : null}
            {!loading && filtered.length === 0 ? (
              <p className="body-copy rounded-xl border border-dashed border-zinc-200 p-4">Заявки не найдены.</p>
            ) : null}

            <div className="admin-list-items">
              {filtered.map((item) => {
                const attachmentsCount = parseAttachments(item.attachments_list_json).length;
                const hasReply = item.current_status === "clarification_received";
                return (
                  <button
                    key={item.request_id}
                    onClick={() => {
                      setSelected(item.request_id);
                      setSelectedStatus(item.current_status);
                      setComment("");
                    }}
                    className={`admin-row admin-ticket-row ${selected === item.request_id ? "admin-row-active" : ""}`}
                  >
                    <div className="admin-ticket-head">
                      <div className="admin-ticket-idline">
                        <p className="meta-label truncate text-emerald-700">{item.request_id}</p>
                        {hasReply ? <span className="admin-badge admin-badge-amber">Ответ</span> : null}
                        {attachmentsCount ? <span className="admin-badge admin-badge-blue">{attachmentsCount} файл</span> : null}
                      </div>
                      <div className="admin-ticket-status">
                        <StatusBadge status={item.current_status} />
                      </div>
                    </div>
                    <p className="admin-ticket-title">
                      {item.requester_fio || "Без имени"} · {item.branch || item.city || "Без филиала"}
                    </p>
                    <p className="admin-ticket-meta">
                      {item.created_date || "Без даты"} · {item.category || "Категория"} · {item.subcategory || "Подкатегория"} · {quantityLabel(item)}
                    </p>
                    <p className="admin-ticket-text">{requestText(item) || "Требование не указано."}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid content-start gap-4">
            {selectedItem ? (
              <>
                <RequestDetails requestId={selectedItem.request_id} onClose={() => setSelected(null)} onChanged={load} mode="admin" />

                <div className="admin-card">
                  <h3 className="section-title text-zinc-950">Статус и комментарий</h3>
                  <p className="body-copy mt-1">
                    Комментарий сохранится в истории и уйдет заявителю в Telegram-уведомлении.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <SelectInput value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as RequestStatus)}>
                      {statusFilterOptions.map((status) => (
                        <option key={status.status} value={status.status}>
                          {status.label}
                        </option>
                      ))}
                    </SelectInput>
                    <Button onClick={() => sendStatus(selectedStatus)} disabled={Boolean(changing)} className="min-h-11">
                      {changing === "status" ? "Сохраняем..." : "Сохранить статус"}
                    </Button>
                  </div>
                  <TextArea
                    className="mt-4"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Комментарий для заявителя"
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={sendComment} disabled={Boolean(changing) || !comment.trim()}>
                      {changing === "comment" ? "Отправляем..." : "Отправить комментарий"}
                    </Button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-7">
                    {ADMIN_STATUS_ACTIONS.map((action) => (
                      <Button
                        key={action.status}
                        variant={action.status === "rejected" ? "danger" : "secondary"}
                        onClick={() => {
                          setSelectedStatus(action.status);
                          void sendStatus(action.status, action.status);
                        }}
                        disabled={Boolean(changing)}
                        className="min-h-12 px-3 text-[12px]"
                      >
                        {changing === action.status ? "Обновляем..." : action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="admin-card">
                <h2 className="section-title text-zinc-950">Выберите заявку</h2>
                <p className="body-copy mt-2">
                  Откройте заявку из списка, чтобы увидеть детали, вложения, историю и изменить статус.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AdminSession>("/api/admin/me")
      .then(setSession)
      .catch((err) => {
        if (!(err instanceof ApiClientError && err.code === "ADMIN_UNAUTHORIZED")) {
          console.warn("ADMIN BOOT ERROR", err);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await apiFetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    setSession(null);
  }

  if (loading) {
    return (
      <main className="admin-shell admin-login-shell">
        <section className="admin-login-card">
          <p className="admin-muted">Загружаем админ-панель...</p>
        </section>
      </main>
    );
  }

  if (!session) return <AdminLogin onLoggedIn={setSession} />;

  return <AdminQueue session={session} onLogout={logout} />;
}
