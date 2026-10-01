import type { ReactNode } from "react";

export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass rounded-2xl ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-grey mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="text-center py-12 animate-fade-in">
      <div className="mx-auto mb-3 text-faint">{icon}</div>
      <p className="text-sm text-grey">{title}</p>
      {hint && <p className="text-xs text-faint mt-1">{hint}</p>}
    </div>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-10 h-6 rounded-full p-0.5 transition-colors disabled:opacity-40 ${
        checked ? "bg-blue" : "bg-line"
      }`}
    >
      <span
        className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function StatCard({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <GlassCard className="px-5 py-4">
      <p className="font-display font-bold text-3xl text-ink">{value}</p>
      <p className="text-xs text-grey mt-1">{label}</p>
    </GlassCard>
  );
}
