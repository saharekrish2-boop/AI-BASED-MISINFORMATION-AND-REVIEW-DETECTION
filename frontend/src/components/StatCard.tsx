import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | null;
  icon: LucideIcon;
  tone?: "default" | "success" | "danger" | "info";
  suffix?: string;
  loading?: boolean;
  index?: number;
  hint?: string;
}

const TONE_STYLES = {
  default: { icon: "text-violet-300 bg-violet-500/10", glow: "from-violet-500/10" },
  success: { icon: "text-emerald-300 bg-emerald-500/10", glow: "from-emerald-500/10" },
  danger: { icon: "text-rose-300 bg-rose-500/10", glow: "from-rose-500/10" },
  info: { icon: "text-cyan-300 bg-cyan-500/10", glow: "from-cyan-500/10" },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  tone = "default",
  suffix = "",
  loading = false,
  index = 0,
  hint,
}: StatCardProps) {
  const t = TONE_STYLES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
    >
      <div className="group relative overflow-hidden rounded-xl border border-border/70 bg-card/70 p-5 backdrop-blur-sm transition-colors hover:border-primary/40">
        <div
          className={cn(
            "pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-2xl transition-opacity group-hover:opacity-100",
            t.glow
          )}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-20" />
            ) : (
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-foreground">
                {value === null ? "—" : value.toLocaleString()}
                {suffix}
              </p>
            )}
            {hint && !loading && (
              <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>
            )}
          </div>
          <div className={cn("rounded-lg p-2.5", t.icon)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
