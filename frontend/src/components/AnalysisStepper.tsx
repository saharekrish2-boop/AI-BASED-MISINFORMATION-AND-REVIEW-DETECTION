import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, ScanSearch, Cpu, Gauge, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Collecting text features", icon: FileText },
  { label: "Processing NLP features", icon: ScanSearch },
  { label: "Running ML classifier", icon: Cpu },
  { label: "Generating result", icon: Gauge },
];

/**
 * Progress stepper shown while a real API request is in flight.
 * Steps advance on a timer but the UI always waits for the actual request
 * to finish (the parent completes/clears this component on response).
 */
export function AnalysisStepper({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    setStep(0);
    const timer = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 700);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-xl border border-primary/25 bg-primary/5 p-6"
      aria-live="polite"
      aria-label="Analysis in progress"
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-400" />
        </span>
        <p className="font-display text-sm font-semibold uppercase tracking-wider text-cyan-300">
          AI analysis in progress
        </p>
      </div>
      <ol className="space-y-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.label} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                  done && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                  current && "border-cyan-500/50 bg-cyan-500/10 text-cyan-300",
                  !done && !current && "border-border bg-muted/40 text-muted-foreground"
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  "text-sm",
                  current ? "font-medium text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/60"
                )}
              >
                {s.label}
              </span>
              {current && (
                <motion.span
                  className="ml-auto text-[11px] font-medium uppercase tracking-wider text-cyan-400"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                >
                  processing
                </motion.span>
              )}
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}
