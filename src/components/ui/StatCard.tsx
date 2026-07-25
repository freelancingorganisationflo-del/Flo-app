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
    <Card className="min-w-[140px] flex-1">
      <div className={`text-[28px] font-extrabold leading-none ${toneText[tone]}`}>{value}</div>
      <div className="mt-1 text-[13px] font-semibold text-navy">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-grey">{sub}</div>}
    </Card>
  );
}
