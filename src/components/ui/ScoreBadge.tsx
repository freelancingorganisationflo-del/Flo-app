interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const colorClass = score >= 75 ? "text-teal border-teal" : score >= 50 ? "text-orange border-orange" : "text-red border-red";
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[2.5px] text-xs font-extrabold ${colorClass}`}
    >
      {score}
    </div>
  );
}
