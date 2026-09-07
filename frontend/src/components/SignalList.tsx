import { AlertTriangle, ShieldCheck, Info, Minus } from "lucide-react";
import type { Signal } from "@/types";
import { cn } from "@/lib/utils";

const SEVERITY_STYLE: Record<string, { icon: typeof AlertTriangle; cls: string; ring: string }> = {
  high: { icon: AlertTriangle, cls: "text-rose-400", ring: "border-rose-500/30 bg-rose-500/5" },
  medium: { icon: AlertTriangle, cls: "text-orange-400", ring: "border-orange-500/30 bg-orange-500/5" },
  low: { icon: Minus, cls: "text-amber-400", ring: "border-amber-500/25 bg-amber-500/5" },
  positive: { icon: ShieldCheck, cls: "text-emerald-400", ring: "border-emerald-500/30 bg-emerald-500/5" },
  info: { icon: Info, cls: "text-cyan-400", ring: "border-cyan-500/30 bg-cyan-500/5" },
};

export function SignalList({ signals }: { signals: Signal[] }) {
  if (!signals.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No notable signals were detected in this text.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {signals.map((signal) => {
        const style = SEVERITY_STYLE[signal.severity] ?? SEVERITY_STYLE.info;
        const Icon = style.icon;
        return (
          <li
            key={signal.id}
            className={cn("flex gap-3 rounded-lg border p-3", style.ring)}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.cls)} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{signal.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                {signal.description}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
