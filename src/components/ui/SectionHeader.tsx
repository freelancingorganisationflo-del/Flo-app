import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  sub?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, sub, action }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4 sm:mb-6">
      <div>
        <h1 className="font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em] text-navy sm:text-[22px]">{title}</h1>
        {sub && <p className="mt-0.5 text-[12px] text-grey sm:mt-1 sm:text-[13px]">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
