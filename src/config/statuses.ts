import type { RequestStatus } from "@/types";

export type StatusTone = "neutral" | "blue" | "orange" | "green" | "red" | "violet";

export const REQUEST_STATUSES: Array<{
  value: RequestStatus;
  label: string;
  tone: StatusTone;
}> = [
  { value: "new", label: "Новая", tone: "neutral" },
  { value: "accepted", label: "Принята", tone: "blue" },
  { value: "in_review", label: "Анализ", tone: "blue" },
  { value: "need_clarification", label: "Требует уточнения", tone: "orange" },
  { value: "clarification_received", label: "Уточнение получено", tone: "orange" },
  { value: "on_approval", label: "Согласование", tone: "violet" },
  { value: "approved", label: "Согласована", tone: "green" },
  { value: "rejected", label: "Отклонена", tone: "red" },
  { value: "on_purchase", label: "На закупе", tone: "violet" },
  { value: "in_production", label: "В работе", tone: "blue" },
  { value: "ready_to_send", label: "Отправка", tone: "green" },
  { value: "sent", label: "Отправлено", tone: "blue" },
  { value: "received", label: "Получено", tone: "green" },
  { value: "completed", label: "Готово", tone: "green" },
  { value: "closed", label: "Закрыто", tone: "neutral" },
];

export const STATUS_LABELS = Object.fromEntries(
  REQUEST_STATUSES.map((status) => [status.value, status.label]),
) as Record<RequestStatus, string>;

export const STATUS_TONES = Object.fromEntries(
  REQUEST_STATUSES.map((status) => [status.value, status.tone]),
) as Record<RequestStatus, StatusTone>;

export const MARKETING_QUICK_ACTIONS: Array<{
  status: RequestStatus;
  label: string;
}> = [
  { status: "accepted", label: "Принята" },
  { status: "in_review", label: "Анализ" },
  { status: "need_clarification", label: "Запросить уточнение" },
  { status: "on_approval", label: "Согласование" },
  { status: "rejected", label: "Отклонить" },
  { status: "on_purchase", label: "Передать на закуп" },
  { status: "in_production", label: "В работе" },
  { status: "ready_to_send", label: "Отправка" },
  { status: "completed", label: "Готово" },
  { status: "closed", label: "Закрыть" },
];

export function getStatusLabel(status: string) {
  return STATUS_LABELS[status as RequestStatus] ?? status;
}

export function isValidStatus(status: string): status is RequestStatus {
  return REQUEST_STATUSES.some((item) => item.value === status);
}
