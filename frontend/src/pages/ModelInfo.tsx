import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Newspaper,
  Star,
  RefreshCcw,
  FlaskConical,
  Database,
  Tag,
  CalendarClock,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { getModelInfo, trainModels, ApiError } from "@/services/api";
import type { ModelInfo } from "@/types";
import { cn, formatDateTime, formatPercent } from "@/lib/utils";

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-center">
      <p className="font-display text-base font-semibold tabular-nums text-foreground">
        {value === null ? "—" : formatPercent(value, 1)}
      </p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function ModelCard({
  info,
  onTrain,
  disabled,
  index,
}: {
  info: ModelInfo;
  onTrain: () => void;
  disabled: boolean;
  index: number;
}) {
  const isNews = info.key === "news";
  const Icon = isNews ? Newspaper : Star;
  const accent = isNews ? "text-cyan-300 bg-cyan-500/10" : "text-violet-300 bg-violet-500/10";
  const cm = info.confusion_matrix;
  const labels = info.labels;

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
              TF-IDF (1-2 grams) → Logistic Regression
            </p>
          </div>
          <Badge variant={info.trained ? "success" : "warning"}>
            {info.trained ? "Trained" : "Not trained"}
          </Badge>
          {info.demo_data && <Badge variant="info">Demo-trained model</Badge>}
        </div>
      </div>
{!info.trained ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold">Model artifact missing</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            No trained weights found on the server. Train the model to create the artifact —
            a small demo dataset is used unless a real dataset is configured.
          </p>
          <Button onClick={onTrain} disabled={disabled}>Train model now</Button>
        </div>
      ) : (
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Accuracy" value={info.accuracy} />
            <Metric label="Precision" value={info.precision} />
            <Metric label="F1 Score" value={info.f1} />
          </div>
          <div className="mt-4 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
            <p className="flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Algorithm: {info.algorithm}
            </p>
            <p className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              Training samples: {info.training_samples === null ? "—" : info.training_samples.toLocaleString()}
            </p>
            <p className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              Test samples: {info.test_samples === null ? "—" : info.test_samples.toLocaleString()}
            </p>
            <p className="flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              Last trained: {formatDateTime(info.last_trained)}
            </p>
          </div>
          {cm && labels && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border/60 scrollbar-thin">
              <table className="w-full text-center text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-2 py-1.5" />
                    <th colSpan={2} className="px-2 py-1.5">Predicted →</th>
                  </tr>
                </thead>
                <tbody>
                  {labels.map((label, i) => (
                    <tr key={label}>
                      <th className="px-2 py-1.5 text-left text-muted-foreground">Actual {label}</th>
                      {cm[i].map((cell, j) => (
                        <td
                          key={j}
                          className={cn(
                            "px-3 py-1.5 font-semibold tabular-nums",
                            i === j ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
  const [training, setTraining] = useState(false);

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

  async function handleTrain() {
    if (training) return;
    setTraining(true);
    toast.info("Training model(s) — this runs real sklearn fitting on the server.");
    try {
      const res = await trainModels("all");
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Training failed.");
    } finally {
      setTraining(false);
    }
  }

  const demoModelMessage =
    "The current models were trained on a small generated dataset so the " +
    "application runs immediately. Accuracy figures are illustrative, not " +
    "production-grade. Swap in a real dataset (see backend/ml/data/README.md) " +
    "and retrain to build production models.";

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
          Both classifiers use TF-IDF vectorisation with logistic regression and are
          trained offline with scikit-learn. No external APIs are required.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            {models?.some((m) => m.demo_data) ? "Demo-trained models" : "Model status"}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {models?.some((m) => m.demo_data) ? demoModelMessage : "Models are trained on the configured dataset."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleTrain} disabled={training}>
          <RefreshCcw className={cn("h-4 w-4", training && "animate-spin")} aria-hidden="true" />
          {training ? "Training…" : "Train / Update Model"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Calls POST /api/models/train — retrains both models with scikit-learn.
        </span>
      </div>

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
            <ModelCard key={m.key} info={m} onTrain={handleTrain} disabled={training} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}