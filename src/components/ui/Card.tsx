import type { ReactNode, MouseEventHandler } from "react";

interface CardProps {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  className?: string;
}

export function Card({ children, onClick, className = "" }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-card border border-border bg-white p-5 transition-all duration-200 ${
        onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(16,36,62,0.1)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
