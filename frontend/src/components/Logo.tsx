import { cn } from "@/lib/utils";

export function Logo({ size = 36, withText = true, className }: {
  size?: number;
  withText?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        role="img"
        aria-label="TruthLens AI logo"
      >
        <defs>
          <linearGradient id="tl-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill="url(#tl-grad)" fillOpacity="0.16" />
        <rect x="1" y="1" width="46" height="46" rx="11" stroke="url(#tl-grad)" strokeOpacity="0.5" strokeWidth="1.5" />
        {/* lens / eye */}
        <ellipse cx="24" cy="24" rx="13" ry="9" stroke="url(#tl-grad)" strokeWidth="2.2" />
        <circle cx="24" cy="24" r="5" fill="url(#tl-grad)" />
        <circle cx="26" cy="22" r="1.6" fill="white" fillOpacity="0.9" />
        {/* neural nodes */}
        <circle cx="10" cy="10" r="2" fill="#22d3ee" />
        <circle cx="38" cy="10" r="2" fill="#8b5cf6" />
        <circle cx="38" cy="38" r="2" fill="#22d3ee" />
        <circle cx="10" cy="38" r="2" fill="#8b5cf6" />
        <path d="M12 12 18 17M36 12 30 17M36 36 30 31M12 36 18 31" stroke="url(#tl-grad)" strokeWidth="1.2" strokeOpacity="0.6" />
      </svg>
      {withText && (
        <div className="leading-none">
          <span className="font-display text-[15px] font-bold tracking-wide text-foreground">
            TRUTHLENS
          </span>
          <span className="ml-1 font-display text-[15px] font-bold tracking-wide text-gradient">
            AI
          </span>
        </div>
      )}
    </div>
  );
}
