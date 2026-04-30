"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { REQUEST_TYPE_LABELS } from "@/config/app";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/components/app/client-api";
import type { MarketingRequest } from "@/types";

type TargetTab = "new" | "mine";

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "blue" | "amber" | "green";
}) {
  const toneClass = {
    blue: "kpi-tile-cyan",
    amber: "kpi-tile-amber",
    green: "kpi-tile-green",
  }[tone];

  return (
    <div className={`kpi-tile ${toneClass}`}>
      <p className="kpi-number">{value}</p>
      <p className="kpi-caption">{label}</p>
      <p className="kpi-hint">{hint}</p>
    </div>
  );
}

function MiniOrderRow({ item, onOpen }: { item: MarketingRequest; onOpen: () => void }) {
  const title = item.item_name || item.subcategory || item.category || item.request_id;

  return (
    <button
      onClick={onOpen}
      className="focus-ring tap-scale grid w-full gap-2 rounded-xl bg-white p-3 text-left shadow-[0_6px_16px_rgba(15,23,42,.05)] transition hover:bg-emerald-50/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="meta-label truncate text-emerald-700">{item.request_id}</p>
          <p className="section-title mt-1 truncate text-zinc-950">{title}</p>
        </div>
        <StatusBadge status={item.current_status} />
      </div>
      <p className="meta-text truncate">
        {REQUEST_TYPE_LABELS[item.request_type]} · {item.branch || item.city || "Без филиала"}
      </p>
    </button>
  );
}

export function HomeDashboard({
  onNavigate,
  refreshToken,
}: {
  onNavigate: (tab: TargetTab) => void;
  refreshToken: number;
}) {
  const [items, setItems] = useState<MarketingRequest[]>([]);
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
    const active = items.filter((item) => !["completed", "closed", "rejected"].includes(item.current_status)).length;
    const needAnswer = items.filter((item) => item.current_status === "need_clarification").length;
    const completed = items.filter((item) => ["completed", "closed"].includes(item.current_status)).length;
    return { active, needAnswer, completed };
  }, [items]);

  const recent = items.slice(0, 3);
  return (
    <section className="grid gap-4">
      <div className="hero-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Заявка в технический отдел</p>
            <h1 className="page-title mt-3 max-w-2xl text-zinc-950">
              Центр заявок технического отдела
            </h1>
            <p className="body-copy mt-3 max-w-xl">
              Создавайте заявки, отслеживайте статусы и держите всю коммуникацию с техническим отделом в одном месте.
            </p>
            <p className="meta-label mt-2 text-emerald-700">Turon Telecom</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <MetricCard label="Активные" value={stats.active} hint="в работе" tone="blue" />
          <MetricCard label="Ответ" value={stats.needAnswer} hint="ждут вас" tone="amber" />
          <MetricCard label="Готово" value={stats.completed} hint="закрыто" tone="green" />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => onNavigate("new")}>Создать заявку</Button>
          <Button variant="secondary" onClick={() => onNavigate("mine")}>
            Мои заявки
          </Button>
        </div>
      </div>

      <div className="route-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Последние заявки</p>
            <h2 className="section-title mt-1 text-zinc-950">Ваш трек</h2>
          </div>
          <button
            onClick={() => onNavigate("mine")}
            className="focus-ring meta-label rounded-xl bg-zinc-100 px-3 py-2 text-zinc-600 transition hover:bg-zinc-200"
          >
            Все
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {loading ? <p className="body-copy rounded-xl bg-zinc-50 p-4">Загружаем заявки...</p> : null}
          {error ? <p className="rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{error}</p> : null}
          {!loading && !error && recent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-5">
              <p className="section-title text-zinc-900">Пока нет заявок</p>
              <p className="body-copy mt-1">
                Создайте первую заявку, и она появится здесь как заказ в трекинге.
              </p>
            </div>
          ) : null}
          {recent.map((item) => (
            <MiniOrderRow key={item.request_id} item={item} onOpen={() => onNavigate("mine")} />
          ))}
        </div>
      </div>
    </section>
  );
}
