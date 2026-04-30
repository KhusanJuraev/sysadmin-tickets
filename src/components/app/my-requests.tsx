"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequestCard } from "@/components/app/request-card";
import { RequestDetails } from "@/components/app/request-details";
import { apiFetch } from "@/components/app/client-api";
import type { MarketingRequest } from "@/types";

type ListFilter = "all" | "active" | "need_answer" | "done";``

const FILTERS: Array<{ id: ListFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные" },
  { id: "need_answer", label: "Нужен ответ" },
  { id: "done", label: "Завершены" },
];

function TrackerKpi({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "cyan" | "amber" | "green" | "lilac" | "coral";
}) {
  const toneClass = {
    cyan: "kpi-tile-cyan",
    amber: "kpi-tile-amber",
    green: "kpi-tile-green",
    lilac: "kpi-tile-lilac",
    coral: "kpi-tile-coral",
  }[tone];

  return (
    <div className={`kpi-tile ${toneClass}`}>
      <p className="kpi-number">{value}</p>
      <p className="kpi-caption">{label}</p>
    </div>
  );
}

function isDone(item: MarketingRequest) {
  return ["completed", "closed", "rejected"].includes(item.current_status);
}

export function MyRequests({ refreshToken }: { refreshToken: number }) {
  const [items, setItems] = useState<MarketingRequest[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch<{ requests: MarketingRequest[] }>("/api/requests?scope=mine")
      .then((data) => setItems(data.requests))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshToken]);

  const stats = useMemo(() => {
    const needAnswer = items.filter((item) => item.current_status === "need_clarification").length;
    const done = items.filter(isDone).length;
    return {
      total: items.length,
      active: items.length - done,
      needAnswer,
      done,
    };
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === "active") return items.filter((item) => !isDone(item));
    if (filter === "need_answer") return items.filter((item) => item.current_status === "need_clarification");
    if (filter === "done") return items.filter(isDone);
    return items;
  }, [filter, items]);

  if (selected) {
    return <RequestDetails requestId={selected} onClose={() => setSelected(null)} onChanged={load} />;
  }

  return (
    <section className="grid gap-4">
      <div className="hero-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Мои заявки</p>
            <h2 className="page-title mt-2 text-zinc-950">Трекер</h2>
            <p className="body-copy mt-2 max-w-xl">
              Статусы, сроки, комментарии технического отдела и история движения по каждой заявке.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TrackerKpi value={stats.total} label="Всего" tone="lilac" />
          <TrackerKpi value={stats.active} label="В работе" tone="cyan" />
          <TrackerKpi value={stats.needAnswer} label="Ждет ответа" tone="amber" />
          <TrackerKpi value={stats.done} label="Завершены" tone="coral" />
        </div>
      </div>

      <div className="segmented-bar">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`focus-ring segmented-item ${filter === item.id ? "segmented-item-active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <p className="premium-card body-copy">Загружаем ваши заявки...</p> : null}
      {error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 shadow-[0_6px_16px_rgba(225,29,72,.06)]">{error}</p> : null}
      {!loading && !error && filtered.length === 0 ? (
        <div className="premium-card border-dashed text-center">
          <p className="section-title text-zinc-950">Здесь пока пусто</p>
          <p className="body-copy mt-2">
            В выбранном фильтре нет заявок. Переключите сегмент или создайте новую заявку.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3">
        {filtered.map((item) => (
          <RequestCard key={item.request_id} item={item} onOpen={setSelected} />
        ))}
      </div>
    </section>
  );
}
