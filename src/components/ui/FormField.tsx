import type { ReactNode } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-sm text-flotext outline-none transition-colors focus:border-teal ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full resize-none rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-sm text-flotext outline-none transition-colors focus:border-teal ${className}`}
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-[12px] font-semibold text-navy">{children}</label>;
}
