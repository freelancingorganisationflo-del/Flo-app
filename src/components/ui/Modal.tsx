import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, subtitle, children, maxWidth = "440px" }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[999] flex items-end justify-center bg-[rgba(5,13,24,0.8)] p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-tealBorder bg-navy p-6 sm:rounded-2xl sm:p-8"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-lg font-extrabold text-white">{title}</div>
        {subtitle && <div className="mb-6 text-[13px] text-white/50">{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
