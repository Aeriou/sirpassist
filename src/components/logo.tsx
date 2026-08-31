import { cn } from "@/lib/utils";

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-surface-2" />
        <path
          d="M16 5.5l8.5 3.2v7.1c0 5.1-3.4 9.7-8.5 11.2-5.1-1.5-8.5-6.1-8.5-11.2V8.7L16 5.5z"
          className="fill-accent"
        />
        <path
          d="M16 8.2l6.2 2.3v5.3c0 3.7-2.5 7.1-6.2 8.2-3.7-1.1-6.2-4.5-6.2-8.2V10.5L16 8.2z"
          className="fill-bg"
        />
        <path
          d="M13.2 16.1l2.1 2.1 4.1-4.4"
          fill="none"
          className="stroke-accent"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {compact ? (
        <span className="sr-only">SiprAssist</span>
      ) : (
        <span className="font-display text-base font-semibold tracking-tight">
          Sipr<span className="text-accent">Assist</span>
        </span>
      )}
    </div>
  );
}
