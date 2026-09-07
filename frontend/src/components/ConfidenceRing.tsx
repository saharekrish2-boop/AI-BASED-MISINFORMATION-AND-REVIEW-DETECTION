import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ConfidenceRingProps {
  value: number; // 0..1
  size?: number;
  strokeWidth?: number;
  tone: "success" | "danger" | "warning" | "info";
  label?: string;
  className?: string;
}

const TONES = {
  success: { stroke: "#10b981", text: "text-emerald-400" },
  danger: { stroke: "#f43f5e", text: "text-rose-400" },
  warning: { stroke: "#f97316", text: "text-orange-400" },
  info: { stroke: "#22d3ee", text: "text-cyan-400" },
};

export function ConfidenceRing({
  value,
  size = 148,
  strokeWidth = 10,
  tone,
  label,
  className,
}: ConfidenceRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  const t = TONES[tone];

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} role="img" aria-label={`Confidence ${(clamped * 100).toFixed(1)} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={t.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
          style={{ filter: `drop-shadow(0 0 6px ${t.stroke}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className={cn("font-display text-3xl font-bold tabular-nums", t.text)}
        >
          {(clamped * 100).toFixed(1)}%
        </motion.span>
        {label && (
          <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
