import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cn("size-9 shrink-0", className)}>
      <defs>
        <linearGradient id="alfa-mark" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="oklch(0.62 0.23 292)" />
          <stop offset="0.55" stopColor="oklch(0.66 0.25 330)" />
          <stop offset="1" stopColor="oklch(0.72 0.17 35)" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#alfa-mark)" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" stroke="white" strokeOpacity="0.18" />
      <path d="M12 29 L20 10 L28 29" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 21.5 L18 27.5 L23.2 24.5 Z" fill="white" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">Alfa AI Studio</div>
        <div className="text-[11px] text-muted-foreground">AI video generation</div>
      </div>
    </div>
  );
}
