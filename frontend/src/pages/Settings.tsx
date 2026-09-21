import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Server,
  Database,
  Cpu,
  BrainCircuit,
  ArrowRight,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  clearHistory,
  getHealth,
  getStats,
  getStoredApiKey,
  hasActiveApiKey,
  setStoredApiKey,
} from "@/services/api";
import type { Health, Stats } from "@/types";
import { formatDateTime } from "@/lib/utils";

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/60 px-3.5 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={ok ? "success" : "danger"}>{ok ? "Online" : "Offline"}</Badge>
    </div>
  );
}

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [clearing, setClearing] = useState(false);
  const [apiKey, setApiKey] = useState(() => getStoredApiKey());
  const [keyActive, setKeyActive] = useState(() => hasActiveApiKey());

  const refresh = () => {
    getHealth().then(setHealth).catch(() => setHealth(null));
    getStats().then(setStats).catch(() => setStats(null));
  };
  useEffect(refresh, []);

  function handleSaveApiKey() {
    setStoredApiKey(apiKey);
    const active = hasActiveApiKey();
    setKeyActive(active);
    if (apiKey.trim()) {
      toast.success("API key saved in this browser for sensitive actions.");
    } else {
      toast.info("Stored API key cleared.");
    }
  }

  async function handleClearHistory() {
    setClearing(true);
    try {
      const res = await clearHistory();
      toast.success(`${res.deleted} record${res.deleted === 1 ? "" : "s"} removed from the database.`);
      refresh();
    } catch (err) {
      // Surfaces the backend's 401/503 guidance (missing or invalid API key).
      toast.error(err instanceof ApiError ? err.message : "Could not clear the history.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-300">
          <SettingsIcon className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Settings & <span className="text-gradient">System</span>
        </h1>
      </div>

      <section className="rounded-xl border border-border/70 bg-card/70 p-5" aria-label="System status">
        <h2 className="font-display text-base font-semibold">System status</h2>
        <p className="mb-4 text-xs text-muted-foreground">Live status of the local TruthLens runtime.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <StatusRow ok={health?.database ?? false} label="Database" detail={`SQLite${health ? ` · v${health.version}` : ""}`} />
          <StatusRow ok={health !== null} label="API" detail={health ? `FastAPI v${health.version}` : "Backend unreachable"} />
          <StatusRow ok={health?.news_model ?? false} label="News model" detail="joblib artifact" />
          <StatusRow ok={health?.review_model ?? false} label="Review model" detail="joblib artifact" />
          <StatusRow ok={health?.analysis_engine ?? false} label="Analysis engine" detail="preprocessing + classification + explainability" />
          <StatusRow ok={health ? health.status === "ok" : false} label="Overall status" detail={health ? (health.status === "ok" ? "All systems nominal" : "Degraded") : "Unknown"} />
        </div>
        {health && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Last health check: {formatDateTime(health.timestamp)}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border/70 bg-card/70 p-5" aria-label="API key">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="h-4 w-4 text-cyan-300" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold">API key</h2>
          <Badge variant={keyActive ? "success" : "warning"}>
            {keyActive ? "Key available" : "No key"}
          </Badge>
        </div>
        <p className="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Sensitive actions such as deleting history or retraining models require the key the
          backend was started with (<code className="rounded bg-muted px-1">TRUTHLENS_API_KEY</code>).
          It is kept in this browser only and is never committed.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <Label htmlFor="api-key" className="mb-2 block">API key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste the value of TRUTHLENS_API_KEY"
              autoComplete="off"
              spellCheck={false}
              maxLength={256}
            />
          </div>
          <Button onClick={handleSaveApiKey}>Save key</Button>
          <Button
            variant="outline"
            onClick={() => {
              setApiKey("");
              setStoredApiKey("");
              setKeyActive(hasActiveApiKey());
              toast.info("Stored API key removed.");
            }}
          >
            Remove stored key
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          {keyActive ? (
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
          ) : (
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
          )}
          {keyActive
            ? "Requests to protected endpoints include the X-API-Key header."
            : "Protected actions fail with 401 until a key is provided."}
        </p>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/70 p-5" aria-label="Data management">
        <h2 className="font-display text-base font-semibold">Data management</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {stats ? `${stats.total_analyses.toLocaleString()} analyses currently stored locally.` : "Loading…"}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="destructive" onClick={handleClearHistory} disabled={clearing}>
            {clearing ? "Clearing…" : "Clear all analysis history"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Deletes every record from SQLite. Requires the API key; this cannot be undone.
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/70 p-5" aria-label="About">
        <h2 className="font-display text-base font-semibold">About TruthLens AI</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          TruthLens AI is an on-device misinformation and review detection system. Text is
          vectorised with TF-IDF and classified by logistic regression models trained with
          scikit-learn. Explainable signals are derived from measurable text features —
          the system is a probabilistic classifier, not a truth-verification engine.
        </p>
        <ul className="mt-4 grid gap-2 text-sm text-muted-foreground lg:grid-cols-2">
          {[
            { icon: Server, text: "Backend: FastAPI + Uvicorn" },
            { icon: Database, text: "Storage: SQLAlchemy + SQLite" },
            { icon: Cpu, text: "ML: scikit-learn TF-IDF + Logistic Regression" },
            { icon: BrainCircuit, text: "Predictions are probabilistic; disclaimer is shown with every result" },
          ].map((item) => (
            <li key={item.text} className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
              <item.icon className="h-4 w-4 text-violet-400" aria-hidden="true" />
              {item.text}
            </li>
          ))}
        </ul>
        <p className="mt-4">
          <Button variant="link" size="sm">
            <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer" className="underline">
              Open API documentation
            </a>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </p>
      </section>
    </div>
  );
}