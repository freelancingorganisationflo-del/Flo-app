import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = "—", title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border py-14 text-center">
      <div className="mb-2 text-3xl opacity-50">{icon}</div>
      <div className="text-sm font-semibold text-navy">{title}</div>
      {description && <div className="mt-1 max-w-xs text-[13px] text-grey">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
