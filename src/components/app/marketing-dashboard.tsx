"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { REQUEST_TYPE_LABELS } from "@/config/app";
import { DICTIONARIES } from "@/config/dictionaries";
import { MARKETING_QUICK_ACTIONS, REQUEST_STATUSES } from "@/config/statuses";
import { Button } from "@/components/ui/button";
import { SelectInput, TextArea, TextInput } from "@/components/ui/form-field";
import { RequestCard } from "@/components/app/request-card";
import { RequestDetails } from "@/components/app/request-details";
import { DriveConnectionCard } from "@/components/app/drive-connection-card";
import { apiFetch } from "@/components/app/client-api";
import type { MarketingRequest, RequestStatus } from "@/types";

type Filters = {
  search: string;
  status: string;
  branch: string;
  department: string;
  category: string;
  type: string;
};

const emptyFilters: Filters = {
  search: "",
  status: "",
  branch: "",
  department: "",
  category: "",
  type: "",
};

function StatTile({ label, value, tone = "zinc" }: { label: string; value: number; tone?: "zinc" | "blue" | "amber" | "green" }) {
  const toneClass = {
    zinc: "bg-white text-zinc-950",
    blue: "bg-emerald-50 text-emerald-800 shadow-[0_8px_20px_rgba(5,150,105,.08)]",
    amber: "bg-amber-50 text-amber-800 shadow-[0_8px_20px_rgba(217,119,6,.08)]",
    green: "bg-emerald-50 text-emerald-800 shadow-[0_8px_20px_rgba(5,150,105,.08)]",
  }[tone];

  return (
    <div className={`metric-pill ${toneClass}`}>
      <p className="kpi-value">{value}</p>
      <p className="meta-label mt-1 opacity-70">{label}</p>
    </div>
  );
}

export function MarketingDashboard({ refreshToken }: { refreshToken: number }) {
  const [items, setItems] = useState<MarketingRequest[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState<RequestStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ requests: MarketingRequest[] }>("/api/requests?scope=all");
      setItems(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshToken]);

  const selectedItem = useMemo(() => items.find((item) => item.request_id === selected) ?? null, [items, selected]);

  const categories = useMemo(() => {
    const values = new Set(items.map((item) => item.category).filter(Boolean));
    return Array.from(values).sort();
  }, [items]);

  const stats = useMemo(() => {
    const needsAnswer = items.filter((item) => item.current_status === "need_clarification").length;
    const newItems = items.filter((item) => item.current_status === "new").length;
    const completed = items.filter((item) => ["completed", "closed"].includes(item.current_status)).length;
    return {
      total: items.length,
      needsAnswer,
      newItems,
      active: items.length - completed,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !query ||
        [item.request_id, item.requester_fio, item.description, item.item_name, item.branch, item.city]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return (
        matchesSearch &&
        (!filters.status || item.current_status === filters.status) &&
        (!filters.branch || item.branch === filters.branch) &&
        (!filters.department || item.department === filters.department) &&
        (!filters.category || item.category === filters.category) &&
        (!filters.type || item.request_type === filters.type)
      );
    });
  }, [filters, items]);

  async function changeStatus(status: RequestStatus) {
    if (!selectedItem) return;
    setChanging(status);
    setError("");
    try {
      await apiFetch(`/api/requests/${selectedItem.request_id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment }),
      });
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить статус");
    } finally {
      setChanging(null);
    }
  }

  return (
    <section className="grid gap-5">
      <div className="hero-surface p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Панель маркетинга</p>
            <h2 className="page-title mt-3 text-zinc-950">Операционный центр</h2>
            <p className="body-copy mt-2 max-w-2xl">
              Очередь заявок, статусы, уточнения и быстрые действия собраны в одном рабочем экране.
            </p>
          </div>
          <div className="meta-label rounded-full bg-white px-4 py-2 text-zinc-700 shadow-[0_6px_16px_rgba(15,23,42,.04)]">
            {filtered.length} из {items.length}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          <StatTile label="Всего" value={stats.total} />
          <StatTile label="Новые" value={stats.newItems} tone="blue" />
          <StatTile label="Ответ" value={stats.needsAnswer} tone="amber" />
          <StatTile label="Активные" value={stats.active} tone="green" />
        </div>
      </div>

      <DriveConnectionCard />

      <div className="route-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="section-title text-zinc-950">Фильтры очереди</h3>
            <p className="body-copy mt-1">Быстро найдите заявку по номеру, филиалу, категории или статусу.</p>
          </div>
          <button
            onClick={() => setFilters(emptyFilters)}
            className="focus-ring meta-label shrink-0 rounded-full bg-zinc-100 px-3 py-2 text-zinc-600 transition hover:bg-zinc-200"
          >
            Сбросить
          </button>
        </div>

        <div className="grid gap-3">
          <TextInput
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Поиск по номеру, описанию, отправителю или филиалу"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SelectInput value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Все статусы</option>
              {REQUEST_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
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
            <SelectInput
              value={filters.department}
              onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}
            >
              <option value="">Все отделы</option>
              {DICTIONARIES.departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </SelectInput>
            <SelectInput value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">Все категории</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </SelectInput>
            <SelectInput value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
              <option value="">Все типы</option>
              {Object.entries(REQUEST_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 shadow-[0_6px_16px_rgba(225,29,72,.06)]">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.95fr)]">
        <div className="grid content-start gap-3">
          {loading ? <p className="premium-card text-sm text-zinc-500">Загружаем очередь заявок...</p> : null}
          {!loading && filtered.length === 0 ? (
            <div className="premium-card border-dashed text-center">
              <p className="section-title text-zinc-950">Заявки не найдены</p>
              <p className="body-copy mt-2">Попробуйте изменить фильтры или строку поиска.</p>
            </div>
          ) : null}
          {filtered.map((item) => (
            <RequestCard key={item.request_id} item={item} onOpen={setSelected} />
          ))}
        </div>

        <div className="grid content-start gap-4">
          {selected ? (
            <>
              <RequestDetails requestId={selected} onClose={() => setSelected(null)} onChanged={load} />
              {selectedItem ? (
                <div className="route-card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="section-title text-zinc-950">Быстрые действия</h3>
                      <p className="body-copy mt-1">
                        Комментарий попадет в историю и уйдет заказчику вместе с уведомлением.
                      </p>
                    </div>
                    <span className="meta-label rounded-full bg-zinc-100 px-3 py-1 text-zinc-500">
                      {selectedItem.request_id}
                    </span>
                  </div>
                  <TextArea
                    className="mt-4"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Комментарий для заказчика"
                  />
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {MARKETING_QUICK_ACTIONS.map((action) => (
                      <Button
                        key={action.status}
                        variant={action.status === "rejected" ? "danger" : "secondary"}
                        onClick={() => changeStatus(action.status)}
                        disabled={Boolean(changing)}
                        className="min-h-12 px-3 text-[12px]"
                      >
                        {changing === action.status ? "Обновляем..." : action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="route-card p-5 text-sm leading-6 text-zinc-500">
              <p className="section-title text-zinc-950">Выберите заявку</p>
              <p className="body-copy mt-2">
                Откройте карточку из очереди, чтобы увидеть детали, вложения, историю и быстрые действия по статусу.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
