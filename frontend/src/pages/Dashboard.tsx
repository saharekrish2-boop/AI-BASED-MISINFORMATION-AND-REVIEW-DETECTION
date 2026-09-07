import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Newspaper,
  Star,
  Activity,
  ShieldAlert,
  Target,
  ArrowRight,
  Database,
  Cpu,
  Server,
  Zap,
  Clock,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { getAnalytics, getHealth, getHistory, getStats } from "@/services/api";
import type { Analytics, Health, HistoryItem, Stats } from "@/types";
import { formatDateTime, formatPercent, truncate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const PREDICTION_STYLE: Record<string, { label: string; variant: "success" | "danger" | "warning" }> = {
  real: { label: "REAL", variant: "success" },
  genuine: { label: "GENUINE", variant: "success" },
  misinformative: { label: "MISINFORMATIVE", variant: "danger" },
  suspicious: { label: "SUSPICIOUS", variant: "warning" },
};

const DONUT_COLORS: Record<string, string> = {
  real: "#10b981",
  misinformative: "#f43f5e",
  genuine: "#10b981",
  suspicious: "#f97316",
};

function DistributionDonut({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number; key: string }[];
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-5">
      <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
      {total === 0 ? (
        <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
          No analysis data yet
        </div>
      ) : (
        <div className="mt-2 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={DONUT_COLORS[entry.key]} />
                ))}
              </Pie>
              <ReTooltip
                contentStyle={{
                  background: "hsl(222 47% 6%)",
                  border: "1px solid hsl(220 27% 16%)",
                  borderRadius: "8px",
                  color: "#e2e8f0",
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function HealthCard({
  icon: Icon,
  title,
  ok,
  detail,
  index,
}: {
  icon: typeof Server;
  title: string;
  ok: boolean;
  detail: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/70 p-4"
    >
      <div
        className={cn(
          "rounded-lg p-2.5",
          ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="relative flex h-2.5 w-2.5" aria-label={ok ? "Operational" : "Down"}>
        {ok && (
          <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-emerald-400 opacity-60" />
        )}
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", ok ? "bg-emerald-400" : "bg-rose-500")} />
      </span>
    </motion.div>
  );
}
export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recent, setRecent] = useState<HistoryItem[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
    getAnalytics().then(setAnalytics).catch(() => setAnalytics(null));
    getHistory({ page_size: 6, sort: "newest" })
      .then((r) => setRecent(r.items))
      .catch(() => setRecent([]));
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const loading = stats === null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          <span className="text-gradient">AI Misinformation Intelligence</span>
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground md:text-base">
          Analyze news and reviews using machine-learning based text classification.
        </p>
      </div>

      {/* Top statistics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Total Analyses" value={stats?.total_analyses ?? null} icon={Activity} loading={loading} index={0} />
        <StatCard title="News Checked" value={stats?.news_count ?? null} icon={Newspaper} tone="info" loading={loading} index={1} />
        <StatCard title="Reviews Checked" value={stats?.review_count ?? null} icon={Star} tone="info" loading={loading} index={2} />
        <StatCard title="Suspicious Content" value={stats?.suspicious_count ?? null} icon={ShieldAlert} tone="danger" loading={loading} index={3} />
        <StatCard
          title="Detection Accuracy"
          value={stats?.detection_accuracy != null ? Number((stats.detection_accuracy * 100).toFixed(1)) : null}
          suffix="%"
          icon={Target}
          tone="success"
          loading={loading}
          index={4}
          hint="Model test accuracy (demo data)"
        />
      </div>

      {/* Quick analysis */}
      <section aria-label="Quick analysis">
        <h2 className="mb-3 font-display text-lg font-semibold">Quick Analysis</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              to: "/news",
              title: "NEWS ANALYZER",
              desc: "Check whether a news article appears real or potentially misleading.",
              cta: "Analyze News",
              icon: Newspaper,
              gradient: "from-cyan-500/15",
              iconCls: "text-cyan-300 bg-cyan-500/10",
            },
            {
              to: "/reviews",
              title: "REVIEW ANALYZER",
              desc: "Detect suspicious or potentially fake customer reviews.",
              cta: "Analyze Review",
              icon: Star,
              gradient: "from-violet-500/15",
              iconCls: "text-violet-300 bg-violet-500/10",
            },
          ].map((card, i) => (
            <motion.div
              key={card.to}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
            >
              <Link
                to={card.to}
                className="group relative block overflow-hidden rounded-xl border border-border/70 bg-card/70 p-6 transition-all hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className={cn("pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br to-transparent blur-2xl", card.gradient)} />
                <div className="flex items-start gap-4">
                  <div className={cn("rounded-xl p-3", card.iconCls)}>
                    <card.icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold tracking-wide text-foreground">{card.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{card.desc}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 transition-transform group-hover:translate-x-0.5">
                      {card.cta}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Recent analyses */}
      <section aria-label="Recent analyses">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Recent Analyses</h2>
          <Link to="/history" className="text-sm font-medium text-violet-300 hover:text-violet-200">
            View all →
          </Link>
        </div>
        {recent === null ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : recent.length === 0 ? (
          <EmptyState
            title="No analyses yet"
            description="Run your first news or review analysis and results will appear here."
            action={
              <Link
                to="/news"
                className="inline-flex h-10 items-center rounded-md bg-gradient-to-r from-violet-600 to-violet-500 px-4 text-sm font-medium text-white hover:from-violet-500"
              >
                Analyze News
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/70 scrollbar-thin">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Text preview</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => {
                  const style = PREDICTION_STYLE[item.prediction];
                  return (
                    <tr key={item.id} className="border-b border-border/40 last:border-0 hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {item.type === "news" ? (
                            <Newspaper className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                          ) : (
                            <Star className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
                          )}
                          <span className="capitalize">{item.type}</span>
                        </span>
                      </td>
                      <td className="max-w-[240px] px-4 py-3 text-muted-foreground">
                        {item.headline ? truncate(item.headline, 48) : truncate(item.input_text, 48)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={style.variant}>{style.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                item.prediction === "real" || item.prediction === "genuine"
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                              )}
                              style={{ width: `${Math.round(item.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums">{formatPercent(item.confidence, 0)}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/history?open=${item.id}`}
                          className="rounded text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Distribution + system status */}
      <section aria-label="Analysis distribution and system status" className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Analysis Distribution</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <DistributionDonut
              title="News: Real vs Misinformation"
              data={[
                { name: "Real", value: analytics?.news_results.real ?? 0, key: "real" },
                { name: "Misinformative", value: analytics?.news_results.misinformative ?? 0, key: "misinformative" },
              ]}
            />
            <DistributionDonut
              title="Reviews: Genuine vs Suspicious"
              data={[
                { name: "Genuine", value: analytics?.review_results.genuine ?? 0, key: "genuine" },
                { name: "Suspicious", value: analytics?.review_results.suspicious ?? 0, key: "suspicious" },
              ]}
            />
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold">System Status</h2>
          <div className="space-y-3">
            <HealthCard
              index={0}
              icon={Cpu}
              title="ML Model"
              ok={(health?.news_model && health?.review_model) ?? false}
              detail="TF-IDF + Logistic Regression · demo-trained"
            />
            <HealthCard
              index={1}
              icon={Database}
              title="Database"
              ok={health?.database ?? false}
              detail="SQLite (local)"
            />
            <HealthCard
              index={2}
              icon={Server}
              title="API"
              ok={health !== null}
              detail={health ? `FastAPI v${health.version}` : "Backend unreachable"}
            />
            <HealthCard
              index={3}
              icon={Zap}
              title="Analysis Engine"
              ok={health?.analysis_engine ?? false}
              detail="Preprocessing · classification · explainability"
            />
          </div>
          {health && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Checked {formatDateTime(health.timestamp)}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}



