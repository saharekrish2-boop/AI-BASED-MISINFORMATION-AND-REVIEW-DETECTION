import { MousePointerClick } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon: Icon = MousePointerClick,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: typeof MousePointerClick;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-14 text-center",
        className
      )}
    >
      <div className="rounded-xl border border-border bg-muted/50 p-3.5 text-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-display text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
