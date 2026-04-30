import { STATUS_TONES, getStatusLabel } from "@/config/statuses";
import type { RequestStatus } from "@/types";

const toneClasses = {
  neutral: "border-zinc-200 bg-white text-zinc-700 before:bg-zinc-400",
  blue: "border-blue-200 bg-blue-50 text-blue-700 before:bg-blue-500",
  orange: "border-amber-200 bg-amber-50 text-amber-800 before:bg-amber-500",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 before:bg-emerald-500",
  red: "border-rose-200 bg-rose-50 text-rose-700 before:bg-rose-500",
  violet: "border-violet-200 bg-violet-50 text-violet-700 before:bg-violet-500",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status as RequestStatus] ?? "neutral";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold leading-4 before:h-1.5 before:w-1.5 before:rounded-full ${toneClasses[tone]}`}>
      {getStatusLabel(status)}
    </span>
  );
}
