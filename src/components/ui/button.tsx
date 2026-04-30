import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  children: ReactNode;
};

const variants = {
  primary:
    "[background:var(--brand-gradient)] text-white shadow-[0_6px_16px_rgba(5,150,105,.20)] hover:shadow-[0_8px_20px_rgba(5,150,105,.24)] active:brightness-95 disabled:bg-none disabled:bg-emerald-200 disabled:shadow-none",
  secondary:
    "border border-zinc-200 bg-white text-zinc-900 hover:border-emerald-200 hover:bg-emerald-50/50 disabled:text-zinc-400",
  ghost: "text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400",
  danger: "bg-rose-600 text-white shadow-[0_4px_12px_rgba(225,29,72,.14)] hover:bg-rose-700 disabled:bg-rose-200 disabled:shadow-none",
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`focus-ring tap-scale inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
