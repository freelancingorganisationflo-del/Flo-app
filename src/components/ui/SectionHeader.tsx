import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  sub?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, sub, action }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-navy">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-grey">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
