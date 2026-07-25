interface BadgeProps {
  label: string;
  tone?: "teal" | "orange" | "red" | "green" | "grey";
}

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  teal: "text-teal bg-tealDim border-tealBorder",
  orange: "text-orange bg-orangeDim border-orange/30",
  red: "text-red bg-redDim border-red/30",
  green: "text-green bg-greenDim border-green/30",
  grey: "text-grey bg-light border-border",
};

export function Badge({ label, tone = "teal" }: BadgeProps) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-[9px] py-[2px] text-[11px] font-bold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
