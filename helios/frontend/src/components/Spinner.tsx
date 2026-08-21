export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-block w-5 h-5 border-2 border-grey/30 border-t-teal rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
