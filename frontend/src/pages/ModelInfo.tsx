import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Newspaper,
  Star,
  FlaskConical,
  Database,
  Tag,
  CalendarClock,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { getModelInfo, ApiError } from "@/services/api";
import type { ModelInfo } from "@/types";

function ModelCard({
  info,
  index,
}: {
  info: ModelInfo;
  index: number;
}) {
  const isNews = info.key === "news";
  const Icon = isNews ? Newspaper : Star;
  const accent = isNews ? "text-cyan-300 bg-cyan-500/10" : "text-violet-300 bg-violet-500/10";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="overflow-hidden rounded-xl border border-border/70 bg-card/70"
    >
      <div className="border-b border-border/60 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className={cn("rounded-xl p-2.5", accent)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold text-foreground">{info.name}</h2>
            <p className="text-xs text-muted-foreground">
              {info.algorithm || "Groq analysis engine"}
            </p>
          </div>
          <Badge variant={info.trained ? "success" : "warning"}>
            {info.trained ? "Configured" : "Not configured"}
          </Badge>
        </div>
      </div>
{!info.trained ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold">Groq not configured</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Set GROQ_API_KEY on the server to enable analysis — all verdicts
            are routed through the Groq API.
          </p>
        </div>
      ) : (
        <div className="p-5">
          <div className="mt-1 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
            <p className="flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Algorithm: {info.algorithm}
            </p>
            <p className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              Engine: Groq API
            </p>
            <p className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              Labels: {(info.labels || []).join(", ") || "—"}
            </p>
            <p className="flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              Classifier: {info.classifier || "Chat Completions (JSON mode)"}
            </p>
          </div>
          {info.data_source && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Data source: {info.data_source}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
export default function ModelInfo() {
  const [models, setModels] = useState<ModelInfo[] | null>(null);

  const load = () => {
    setModels(null);
    getModelInfo()
      .then(setModels)
      .catch((err) => {
        setModels([]);
        toast.error(err instanceof ApiError ? err.message : "Could not load model info.");
      });
  };

  useEffect(load, []);

  const groqRouteMessage =
    "All analysis is routed through the Groq API — no local TF-IDF or " +
    "scikit-learn models are used. Results are stored as separate database " +
    "entries and returned as concise, structured JSON (prediction, confidence, " +
    "credibility, bias level, flags). Set GROQ_API_KEY on the server to enable analysis.";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-300">
            <BrainCircuit className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            AI Model <span className="text-gradient">Center</span>
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
          All analysis is routed through the Groq API — no local TF-IDF or
          scikit-learn models. Results are returned as concise, structured JSON
          (prediction, confidence, credibility, bias level, flags).
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Groq analysis engine
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {groqRouteMessage}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
          Local training was removed — analysis is Groq-only (POST /api/models/train returns 410).
        </p>

      {models === null ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : models.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title="Model information unavailable"
          description="The backend could not provide model metadata. Make sure the API is running."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {models.map((m, i) => (
            <ModelCard key={m.key} info={m} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}