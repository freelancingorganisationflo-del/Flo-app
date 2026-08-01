import { Card } from "./Card";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "teal" | "orange" | "navy" | "green";
}

const toneText: Record<NonNullable<StatCardProps["tone"]>, string> = {
  teal: "text-teal",
  orange: "text-orange",
  navy: "text-navy",
  green: "text-green",
};

export function StatCard({ label, value, sub, tone = "teal" }: StatCardProps) {
  return (
    <Card className="min-w-[130px] flex-1">
      <div className={`text-[22px] font-extrabold leading-none sm:text-[28px] ${toneText[tone]}`}>{value}</div>
      <div className="mt-1 text-[12px] font-semibold text-navy sm:text-[13px]">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-grey sm:text-[11px]">{sub}</div>}
    </Card>
  );
}
