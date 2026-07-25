interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: "teal" | "orange" | "grey";
}

const barTone: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  teal: "bg-teal",
  orange: "bg-orange",
  grey: "bg-grey",
};

const trackTone: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  teal: "bg-teal/15",
  orange: "bg-orange/15",
  grey: "bg-grey/15",
};

export function ProgressBar({ value, max = 100, tone = "teal" }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`h-[5px] flex-1 overflow-hidden rounded ${trackTone[tone]}`}>
      <div
        className={`h-full rounded transition-[width] duration-500 ease-out ${barTone[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
