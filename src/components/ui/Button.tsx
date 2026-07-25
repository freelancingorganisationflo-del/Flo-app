import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-teal text-navy hover:bg-teal2 font-extrabold",
  secondary: "bg-light text-navy hover:bg-border font-semibold",
  danger: "bg-red text-white hover:bg-red/90 font-bold",
  ghost: "bg-transparent text-grey hover:text-navy font-semibold",
};

export function Button({ variant = "primary", className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`rounded-[10px] px-4 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
