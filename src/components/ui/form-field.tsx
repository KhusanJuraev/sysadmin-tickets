import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-zinc-800">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {hint ? <span className="meta-text text-zinc-400">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="meta-text text-rose-600">{error}</span> : null}
    </label>
  );
}

const baseControl =
  "min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-950 outline-none transition duration-200 placeholder:text-zinc-400 focus:border-emerald-400 focus:ring-3 focus:ring-emerald-100 disabled:bg-zinc-50 disabled:text-zinc-500";

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseControl} ${className}`} />;
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseControl} min-h-28 resize-none py-3 ${className}`} />;
}

export function SelectInput({ children, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${baseControl} appearance-auto ${className}`}>
      {children}
    </select>
  );
}
