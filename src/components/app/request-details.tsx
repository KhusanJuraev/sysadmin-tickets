"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { REQUEST_TYPE_LABELS } from "@/config/app";
import { getStatusLabel } from "@/config/statuses";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TextArea } from "@/components/ui/form-field";
import { apiFetch } from "@/components/app/client-api";
import { uploadFilesToSupabase } from "@/components/app/storage-upload";
import { normalizeUploadWarnings } from "@/lib/storage/attachments";
import type { AttachmentMeta, MarketingRequest, RequestStatus, StatusHistoryEntry } from "@/types";

function parseAttachments(value: string) {
  try {
    return value ? (JSON.parse(value) as AttachmentMeta[]) : [];
  } catch {
    return [];
  }
}

function compactSize(size: number) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="border-b border-zinc-100 py-3 last:border-b-0">
      <dt className="meta-label text-zinc-400">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-zinc-800">{value}</dd>
    </div>
  );
}

function Section({
  title,
  hint,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="route-card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="focus-ring flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-emerald-50/35"
      >
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="section-title truncate text-zinc-950">{title}</span>
            {meta ? (
              <span className="meta-text rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-600">
                {meta}
              </span>
            ) : null}
          </span>
          {hint ? <span className="body-copy mt-1 block line-clamp-2">{hint}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="meta-label hidden text-emerald-700 sm:inline">{open ? "Скрыть" : "Открыть"}</span>
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-lg font-bold leading-none text-emerald-700 transition ${
              open ? "rotate-180" : ""
            }`}
          >
            ⌄
          </span>
        </span>
      </button>

      {open ? <div className="border-t border-zinc-100 p-5 pt-4">{children}</div> : null}
    </section>
  );
}

function timelineTitle(entry: StatusHistoryEntry) {
  const oldStatus = entry.old_status ? getStatusLabel(entry.old_status) : "";
  const newStatus = getStatusLabel(entry.new_status);
  if (oldStatus && oldStatus === newStatus) return newStatus;
  return oldStatus ? `${oldStatus} → ${newStatus}` : newStatus;
}

function quantityLabel(item: MarketingRequest) {
  return `${item.quantity || ""} ${item.unit || ""}`.trim();
}

function requestRequirement(item: MarketingRequest) {
  return item.requirements || item.description || "";
}

function pluralRu(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function filesCountLabel(count: number) {
  if (!count) return "Нет файлов";
  return `${count} ${pluralRu(count, "файл", "файла", "файлов")}`;
}

function historyCountLabel(count: number) {
  if (!count) return "Пока нет";
  return `${count} ${pluralRu(count, "событие", "события", "событий")}`;
}

function isMarketingEntry(entry: StatusHistoryEntry) {
  return entry.changed_by_role === "marketing" || entry.changed_by_role === "marketing_head";
}

function canUserReply(status: RequestStatus) {
  return !["completed", "closed", "rejected"].includes(status);
}

const TRACK_STAGES: Array<{
  label: string;
  hint: string;
  statuses: RequestStatus[];
}> = [
  { label: "Принята", hint: "заявка создана", statuses: ["new", "accepted"] },
  {
    label: "Анализ",
    hint: "проверка деталей",
    statuses: ["in_review", "need_clarification", "clarification_received"],
  },
  { label: "Согласование", hint: "решение принято", statuses: ["on_approval", "approved"] },
  { label: "В работе", hint: "производство/закуп", statuses: ["on_purchase", "in_production"] },
  { label: "Отправка", hint: "готово к выдаче", statuses: ["ready_to_send", "sent", "received"] },
  { label: "Готово", hint: "заявка закрыта", statuses: ["completed", "closed"] },
];

function stageIndex(status: RequestStatus) {
  if (status === "rejected") return -1;
  const index = TRACK_STAGES.findIndex((stage) => stage.statuses.includes(status));
  return index >= 0 ? index : 0;
}

function SmartTracking({ status }: { status: RequestStatus }) {
  const currentIndex = stageIndex(status);
  const rejected = status === "rejected";
  const trackProgress = Math.max(10, Math.min(100, ((currentIndex + 1) / TRACK_STAGES.length) * 100));

  return (
    <section className="smart-track-card p-4 sm:p-5">
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Умный трекинг</p>
          <h3 className="section-title mt-1 text-zinc-950">Путь заявки</h3>
        </div>
        <span className={`meta-label rounded-full px-3 py-1 shadow-[0_6px_16px_rgba(15,23,42,.06)] ${rejected ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {getStatusLabel(status)}
        </span>
      </div>

      {rejected ? (
        <div className="relative z-10 mt-4 rounded-xl bg-rose-50 p-4 text-rose-800 shadow-[0_8px_20px_rgba(225,29,72,.06)]">
          <p className="section-title">Заявка отклонена</p>
          <p className="body-copy mt-1 text-rose-700">Причина и комментарий маркетинга отображаются ниже в карточке заявки.</p>
        </div>
      ) : (
        <>
          <div className="smart-track-progress relative z-10 mt-4">
            <div className="smart-track-progress-fill" style={{ width: `${trackProgress}%` }} />
          </div>
          <div className="smart-track-scroll relative z-10 mt-4">
            {TRACK_STAGES.map((stage, index) => {
              const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "wait";
              return (
                <div key={stage.label} className={`smart-track-step smart-track-step-${state}`}>
                  <div className="smart-track-step-head">
                    <span
                      className={`smart-track-step-index ${
                        state === "done"
                          ? "bg-emerald-600 text-white"
                          : state === "active"
                            ? "bg-white text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <p className="smart-track-title">{stage.label}</p>
                  </div>
                  <p className="smart-track-hint">{stage.hint}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export function RequestDetails({
  requestId,
  onClose,
  onChanged,
  mode = "user",
}: {
  requestId: string;
  onClose: () => void;
  onChanged?: () => void;
  mode?: "user" | "admin";
}) {
  const [item, setItem] = useState<MarketingRequest | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploadedClarificationAttachments, setUploadedClarificationAttachments] = useState<AttachmentMeta[]>([]);
  const [clarificationUploadWarnings, setClarificationUploadWarnings] = useState<string[]>([]);
  const [uploadingClarification, setUploadingClarification] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      apiFetch<{ request: MarketingRequest; history: StatusHistoryEntry[] }>(`/api/requests/${requestId}`)
        .then((data) => {
          if (!alive) return;
          setItem(data.request);
          setHistory(data.history);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [requestId]);

  const attachments = useMemo(() => parseAttachments(item?.attachments_list_json ?? ""), [item]);
  const storedWarnings = useMemo(() => normalizeUploadWarnings(item?.upload_warnings ? item.upload_warnings.split("\n") : []), [item]);
  const chatEntries = useMemo(() => history.filter((entry) => entry.comment.trim()), [history]);

  async function sendClarification() {
    if (!item) return;
    setSending(true);
    setError("");
    setWarnings([]);
    try {
      const result = await apiFetch<{ warnings?: string[] }>(`/api/requests/${item.request_id}/clarification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment,
          attachments: uploadedClarificationAttachments,
          uploadWarnings: clarificationUploadWarnings,
        }),
      });
      setWarnings(normalizeUploadWarnings(result.warnings ?? []));
      setComment("");
      setFiles(null);
      setUploadedClarificationAttachments([]);
      setClarificationUploadWarnings([]);
      onChanged?.();
      const fresh = await apiFetch<{ request: MarketingRequest; history: StatusHistoryEntry[] }>(
        `/api/requests/${requestId}`,
      );
      setItem(fresh.request);
      setHistory(fresh.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить уточнение");
    } finally {
      setSending(false);
    }
  }

  async function handleClarificationFiles(nextFiles: FileList | null) {
    setFiles(nextFiles);
    setUploadedClarificationAttachments([]);
    setClarificationUploadWarnings([]);

    const selected = Array.from(nextFiles ?? []);
    if (!selected.length) return;

    setUploadingClarification(true);
    try {
      const result = await uploadFilesToSupabase(selected);
      setUploadedClarificationAttachments(result.attachments);
      setClarificationUploadWarnings(normalizeUploadWarnings(result.warnings));
    } catch (err) {
      setClarificationUploadWarnings(
        normalizeUploadWarnings([
          err instanceof Error
            ? err.message
            : "Не удалось загрузить вложение. Можно отправить уточнение без файла.",
        ]),
      );
    } finally {
      setUploadingClarification(false);
    }
  }

  if (loading) {
    return <div className="premium-card body-copy">Загружаем карточку заявки...</div>;
  }

  if (!item) {
    return (
      <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 shadow-[0_6px_16px_rgba(225,29,72,.06)]">
        {error || "Заявка не найдена"}
      </div>
    );
  }

  const folderUrl = item.drive_folder_url || item.attachments_folder_url;
  const routeFrom = item.branch || item.city || "Филиал";
  const routeTo = item.assigned_marketing_user || "Маркетинг";
  const quantity = quantityLabel(item);
  const requirement = requestRequirement(item);
  const hasLegacyExtraDetails = Boolean(
    item.purpose ||
      item.justification ||
      item.delivery_address ||
      item.receiver_name ||
      item.receiver_contact ||
      item.related_object,
  );

  return (
    <section className="grid gap-4">
      <div className="hero-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <StatusBadge status={item.current_status} />
            <h2 className="screen-title mt-4 truncate text-zinc-950">{item.request_id}</h2>
            <p className="body-copy mt-2">
              {REQUEST_TYPE_LABELS[item.request_type]} · {item.category} · {item.subcategory}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>

      <SmartTracking status={item.current_status} />

      <section className="route-card bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="section-title truncate text-zinc-950">{routeFrom}</p>
            <p className="meta-text mt-1">Источник заявки</p>
          </div>
          <div className="mt-3 h-px w-12 shrink-0 bg-emerald-200" />
          <div className="min-w-0 flex-1 text-right">
            <p className="section-title truncate text-emerald-700">{routeTo}</p>
            <p className="meta-text mt-1">Исполнитель</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="kpi-tile kpi-tile-cyan min-h-[82px] p-3">
            <p className="kpi-caption">Дата</p>
            <p className="mt-1 truncate text-[15px] font-bold leading-5">{item.created_date || "Не указана"}</p>
          </div>
          <div className="kpi-tile kpi-tile-amber min-h-[82px] p-3">
            <p className="kpi-caption">Срок</p>
            <p className="mt-1 truncate text-[15px] font-bold leading-5">{item.needed_date || "Маркетинг"}</p>
          </div>
          <div className="kpi-tile kpi-tile-green min-h-[82px] p-3">
            <p className="kpi-caption">Кол-во</p>
            <p className="mt-1 truncate text-[15px] font-bold leading-5">{quantity || "Не указано"}</p>
          </div>
        </div>
      </section>

      {storedWarnings.length ? (
        <div className="soft-alert body-copy p-4">
          <p className="font-semibold">Есть предупреждения по вложениям</p>
          <ul className="mt-2 list-inside list-disc">
            {storedWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section
        title="Основная информация"
        hint="Профильные данные отправителя. Обычно их можно держать свернутыми."
        meta="Профиль"
      >
        <dl className="grid gap-x-6 sm:grid-cols-2">
          <DetailLine label="Отправитель" value={item.requester_fio} />
          <DetailLine label="Телефон" value={item.phone} />
          <DetailLine label="Филиал" value={item.branch} />
          <DetailLine label="Город" value={item.city} />
          <DetailLine label="Отдел" value={item.department} />
          <DetailLine label="Должность" value={item.position} />
        </dl>
      </Section>

      <Section title="Требование" hint="Что нужно подготовить, сделать или доставить." meta="Суть заявки" defaultOpen>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-4">
          <p className="body-copy text-zinc-800">{requirement || "Требование не указано."}</p>
        </div>
        <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
          <DetailLine label="Категория" value={item.category} />
          <DetailLine label="Подкатегория" value={item.subcategory} />
          <DetailLine label="Объект" value={quantity} />
          <DetailLine label="Доставка" value={item.need_delivery ? "Да" : "Нет"} />
          <DetailLine label="Монтаж" value={item.need_installation ? "Да" : "Нет"} />
        </dl>
      </Section>

      {hasLegacyExtraDetails ? (
        <Section
          title="Дополнительные данные"
          hint="Данные из старых заявок, если они были заполнены ранее."
          meta={item.receiver_name || item.related_object || "Архив"}
        >
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <DetailLine label="Назначение" value={item.purpose} />
            <DetailLine label="Обоснование" value={item.justification} />
            <DetailLine label="Адрес" value={item.delivery_address} />
            <DetailLine label="Получатель" value={item.receiver_name} />
            <DetailLine label="Контакт получателя" value={item.receiver_contact} />
            <DetailLine label="Связанный объект" value={item.related_object} />
          </dl>
        </Section>
      ) : null}

      <Section
        title="Вложения"
        hint="Файлы заявки, если файловое хранилище доступно."
        meta={filesCountLabel(attachments.length)}
      >
        <div className="grid gap-2">
          {folderUrl ? (
            <a
              className="focus-ring meta-label inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-emerald-800 transition hover:bg-emerald-100"
              href={folderUrl}
              target="_blank"
              rel="noreferrer"
            >
              Открыть папку заявки
            </a>
          ) : null}
          {attachments.length ? (
            attachments.map((file) => (
              <a
                key={`${file.id}-${file.name}`}
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="focus-ring flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-700 transition hover:border-emerald-200 hover:text-emerald-700"
              >
                <span className="min-w-0 truncate font-semibold">{file.name}</span>
                <span className="meta-text shrink-0 text-zinc-400">{compactSize(file.size)}</span>
              </a>
            ))
          ) : (
            <p className="body-copy rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-4">
              Вложения не добавлены.
            </p>
          )}
        </div>
      </Section>

      {item.marketing_comment ? (
        <Section title="Комментарий технический отдела" meta="Важно" defaultOpen>
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-950">
            {item.marketing_comment}
          </p>
        </Section>
      ) : null}

      <Section
        title="Комментарии"
        hint="Переписка по заявке между технический отделом и заявителем."
        meta={historyCountLabel(chatEntries.length)}
        defaultOpen={Boolean(chatEntries.length)}
      >
        {chatEntries.length ? (
          <div className="grid gap-3">
            {chatEntries.map((entry, index) => {
              const marketing = isMarketingEntry(entry);
              return (
                <div
                  key={`${entry.changed_at}-${entry.changed_by}-${index}`}
                  className={`rounded-xl p-4 ${
                    marketing
                      ? "bg-emerald-50 text-emerald-950"
                      : "bg-sky-50 text-sky-950"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold">{marketing ? "Маркетинг" : "Заявитель"} · {entry.changed_by || "Система"}</p>
                    <p className="meta-text">{entry.changed_at}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6">{entry.comment}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="body-copy rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-4">
            Комментариев пока нет.
          </p>
        )}
      </Section>

      <Section
        title="История статусов"
        hint="Движение заявки фиксируется при каждом изменении."
        meta={historyCountLabel(history.length)}
      >
        {history.length ? (
          <div className="tracking-line grid gap-4">
            {history.map((entry, index) => {
              const active = index === history.length - 1;
              return (
                <div key={`${entry.changed_at}-${index}`} className="relative grid gap-1 pl-8">
                  <span
                    className={`absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-white ${
                      active ? "border-emerald-500" : "border-zinc-200"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-600" : "bg-zinc-300"}`} />
                  </span>
                  <div className="rounded-xl bg-white p-4 shadow-[0_6px_16px_rgba(15,23,42,.035)]">
                    <p className="section-title text-zinc-950">{timelineTitle(entry)}</p>
                    <p className="meta-text mt-1 text-zinc-400">{entry.changed_at}</p>
                    {entry.comment ? <p className="body-copy mt-3 text-zinc-700">{entry.comment}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="body-copy rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-4">
            История появится после первого изменения статуса.
          </p>
        )}
      </Section>

      {mode === "user" && canUserReply(item.current_status) ? (
        <section className="rounded-xl bg-amber-50 p-5 shadow-[0_8px_20px_rgba(217,119,6,.08)]">
          <h3 className="section-title text-amber-950">
            {item.current_status === "need_clarification" ? "Требуется уточнение" : "Ответить маркетингу"}
          </h3>
          <p className="body-copy mt-2 text-amber-800">
            {item.current_status === "need_clarification"
              ? item.marketing_comment || "Технический отдел запросил дополнительную информацию по заявке."
              : "Можно написать комментарий по заявке или приложить дополнительный файл."}
          </p>
          <div className="mt-4 grid gap-3">
            <TextArea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Напишите уточнение для маркетинга"
            />
            <input
              type="file"
              multiple
              onChange={(event) => void handleClarificationFiles(event.target.files)}
              className="min-h-11 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-zinc-700"
            />
            {files?.length ? (
              <p className="meta-text text-amber-800">
                {uploadingClarification
                  ? "Загружаем вложение..."
                  : uploadedClarificationAttachments.length
                    ? `${uploadedClarificationAttachments.length} файл(ов) загружено`
                    : "Файл выбран, но не загружен. Уточнение можно отправить без файла."}
              </p>
            ) : null}
            {clarificationUploadWarnings.length ? (
              <div className="rounded-xl bg-white/80 p-3 text-sm leading-6 text-amber-900">
                {clarificationUploadWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            <Button onClick={sendClarification} disabled={sending || uploadingClarification}>
              {sending ? "Отправляем..." : uploadingClarification ? "Загрузка..." : "Отправить уточнение"}
            </Button>
          </div>
        </section>
      ) : null}

      {warnings.length ? (
        <div className="soft-alert body-copy p-4">
          <p className="font-semibold">Уточнение отправлено, но часть вложений не загрузилась</p>
          <ul className="mt-2 list-inside list-disc">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 shadow-[0_6px_16px_rgba(225,29,72,.06)]">{error}</p> : null}
    </section>
  );
}
