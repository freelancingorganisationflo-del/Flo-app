export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-block w-5 h-5 border-2 border-line border-t-cyan rounded-full animate-spin shadow-glow-sm ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
