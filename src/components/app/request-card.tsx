import { REQUEST_TYPE_LABELS } from "@/config/app";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MarketingRequest } from "@/types";

function shortDate(value: string) {
  return value || "Без даты";
}

function quantityLabel(item: MarketingRequest) {
  return `${item.quantity || ""} ${item.unit || ""}`.trim();
}

function requestSummary(item: MarketingRequest) {
  return item.requirements || item.description || "";
}

export function RequestCard({
  item,
  onOpen,
}: {
  item: MarketingRequest;
  onOpen: (requestId: string) => void;
}) {
  const title = item.item_name || item.subcategory || item.category || "Маркетинговая заявка";
  const branch = item.branch || item.city || "Без филиала";
  const quantity = quantityLabel(item);
  const summary = requestSummary(item);

  return (
    <button
      onClick={() => onOpen(item.request_id)}
      className="focus-ring tap-scale w-full rounded-xl bg-white p-4 text-left shadow-[0_8px_22px_rgba(15,23,42,.055)] transition hover:bg-emerald-50/35"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="meta-label min-w-0 truncate text-emerald-700">
          {item.request_id}
        </p>
        <StatusBadge status={item.current_status} />
      </div>

      <h3 className="section-title mt-2 line-clamp-1 text-zinc-950">{title}</h3>
      <p className="meta-text mt-1 truncate">
        {REQUEST_TYPE_LABELS[item.request_type]} · {branch}
      </p>

      {summary ? <p className="body-copy mt-3 line-clamp-2">{summary}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {item.category ? (
          <span className="meta-text rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
            {item.category}
          </span>
        ) : null}
        <span className="meta-text rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-600">
          {shortDate(item.created_date)}
        </span>
        {quantity ? (
          <span className="meta-text rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
            {quantity}
          </span>
        ) : null}
        <span className="meta-text rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">
          Маркетинг
        </span>
      </div>
    </button>
  );
}
