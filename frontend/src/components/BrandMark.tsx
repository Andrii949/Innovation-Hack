import { cn } from "cn";

/** Measurement-target mark: registration ticks around an optical centre. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-9 shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" rx="9" className="fill-chart-2" />
      <circle cx="16" cy="16" r="6.4" className="fill-none stroke-primary" strokeWidth="1.3" />
      <path
        d="M16 5.5v4M16 22.5v4M5.5 16h4M22.5 16h4"
        className="stroke-primary"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="1.7" className="fill-primary" />
    </svg>
  );
}
