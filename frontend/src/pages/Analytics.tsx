import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Newspaper,
  Star,
  Gauge,
  CalendarDays,
  ShieldAlert,
  Smile,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAnalytics, ApiError } from "@/services/api";
import type { Analytics } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

const TOOLTIP_STYLE = {
  background: "hsl(222 47% 6%)",
  border: "1px solid hsl(220 27% 16%)",
  borderRadius: "8px",
  color: "#e2e8f0",
  fontSize: "12px",
};

const COLORS = {
  real: "#10b981",
  misinformative: "#f43f5e",
  genuine: "#10b981",
  suspicious: "#f97316",
  news: "#22d3ee",
  review: "#8b5cf6",
};

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof BarChart3;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-5">
      <h3 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-violet-400" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((err) => {
        setData(null);
        toast.error(err instanceof ApiError ? err.message : "Could not load analytics.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.has_data) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Analytics <span className="text-gradient">Dashboard</span>
        </h1>
        <EmptyState
          icon={BarChart3}
          title="No analysis data yet"
          description="Charts will appear here once you start analyzing news articles and reviews. All visualizations are generated from real database records."
        />
      </div>
    );
  }

  const resultsData = [
    { name: "Real news", value: data.news_results.real, color: COLORS.real },
    { name: "Misinformative", value: data.news_results.misinformative, color: COLORS.misinformative },
    { name: "Genuine reviews", value: data.review_results.genuine, color: COLORS.genuine },
    { name: "Suspicious reviews", value: data.review_results.suspicious, color: COLORS.suspicious },
  ].filter((d) => d.value > 0);

  const typeData = [
    { name: "News", count: data.type_counts.news },
    { name: "Reviews", count: data.type_counts.review },
  ];

  const sentimentData = [
    { name: "Positive", value: data.sentiment_distribution.positive, color: "#10b981" },
    { name: "Neutral", value: data.sentiment_distribution.neutral, color: "#64748b" },
    { name: "Negative", value: data.sentiment_distribution.negative, color: "#f43f5e" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Analytics <span className="text-gradient">Dashboard</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {data.total} analysis{data.total === 1 ? "" : "es"} · all data from your local database
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-card/70 px-4 py-2.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Suspicious content rate</p>
          <p className="font-display text-xl font-bold tabular-nums text-orange-300">
            {(data.suspicious_rate * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
{/* 1. Detection results distribution */}
        <ChartCard title="Detection Results Distribution" icon={Gauge}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={resultsData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {resultsData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <ReTooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 2. News vs Review */}
        <ChartCard title="News vs Review Analysis" icon={BarChart3}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 27% 16%)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "hsl(220 27% 16%)" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                <ReTooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(220 28% 14% / 0.5)" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  <Cell fill={COLORS.news} />
                  <Cell fill={COLORS.review} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 3. Confidence distribution */}
        <ChartCard title="Confidence Distribution" icon={Gauge}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.confidence_buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 27% 16%)" vertical={false} />
                <XAxis dataKey="range" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "hsl(220 27% 16%)" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                <ReTooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(220 28% 14% / 0.5)" }} />
                <Bar dataKey="count" name="Analyses" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
{/* 4. Daily volume */}
        <ChartCard title="Daily Analysis Volume (14 days)" icon={CalendarDays}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily_volume}>
                <defs>
                  <linearGradient id="newsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="reviewGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 27% 16%)" vertical={false} />
                <XAxis dataKey="short" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "hsl(220 27% 16%)" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                <ReTooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                <Area type="monotone" dataKey="news" name="News" stroke="#22d3ee" fill="url(#newsGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="review" name="Reviews" stroke="#8b5cf6" fill="url(#reviewGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 5. Suspicious content rate */}
        <ChartCard title="Suspicious Content Rate (daily)" icon={ShieldAlert}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily_suspicious_rate}>
                <defs>
                  <linearGradient id="flagGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 27% 16%)" vertical={false} />
                <XAxis dataKey="short" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "hsl(220 27% 16%)" }} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                <ReTooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="rate" name="Flagged rate" stroke="#f97316" fill="url(#flagGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
{/* 6. Sentiment distribution */}
        <ChartCard title="Sentiment Distribution" icon={Smile}>
          {sentimentData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No sentiment data yet
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3} strokeWidth={0}>
                    {sentimentData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <ReTooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
        <Star className="h-3.5 w-3.5" aria-hidden="true" />
        All charts are computed from stored analyses — no sample or random data.
      </p>
    </div>
  );
}