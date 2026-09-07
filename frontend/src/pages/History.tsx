import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  History as HistoryIcon,
  Search,
  Newspaper,
  Star,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Brain,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { SignalList } from "@/components/SignalList";
import { TextStatsGrid } from "@/components/TextStatsGrid";
import { deleteHistoryItem, getHistory, getHistoryItem, ApiError } from "@/services/api";
import type { HistoryItem } from "@/types";
import { cn, formatDateTime, formatPercent, truncate } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "type:news", label: "News" },
  { key: "type:review", label: "Reviews" },
  { key: "pred:real", label: "Real" },
  { key: "pred:misinformative", label: "Misinformation" },
  { key: "pred:genuine", label: "Genuine" },
  { key: "pred:suspicious", label: "Suspicious" },
] as const;

const PREDICTION_STYLE: Record<string, { label: string; variant: "success" | "danger" | "warning" }> = {
  real: { label: "REAL", variant: "success" },
  genuine: { label: "GENUINE", variant: "success" },
  misinformative: { label: "MISINFORMATIVE", variant: "danger" },
  suspicious: { label: "SUSPICIOUS", variant: "warning" },
};

function DetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [item, setItem] = useState<HistoryItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (id === null) {
      setItem(null);
      return;
    }
    setLoading(true);
    getHistoryItem(id)
      .then(setItem)
      .catch(() => toast.error("Could not load the analysis detail."))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {loading || !item ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-6">
                {item.type === "news" ? (
                  <Newspaper className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                ) : (
                  <Star className="h-4 w-4 text-violet-400" aria-hidden="true" />
                )}
                Analysis #{item.id}
                <Badge variant={PREDICTION_STYLE[item.prediction].variant}>
                  {PREDICTION_STYLE[item.prediction].label}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {item.type === "news" ? "News article analysis" : "Customer review analysis"} ·{" "}
                {formatDateTime(item.created_at)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                {item.headline && (
                  <p className="mb-1.5 font-display text-sm font-semibold text-foreground">
                    {item.headline}
                  </p>
                )}
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground scrollbar-thin">
                  {item.input_text}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { icon: Brain, label: "Confidence", value: formatPercent(item.confidence, 1) },
                  { icon: Timer, label: "Processing", value: `${item.processing_time} ms` },
                  { icon: HistoryIcon, label: "Model", value: item.model_name },
                  {
                    icon: Star,
                    label: "Sentiment",
                    value: item.sentiment ? item.sentiment : "—",
                  },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <m.icon className="h-3 w-3" aria-hidden="true" /> {m.label}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold" title={m.value}>
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>

              {item.signals.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Signals</h4>
                  <SignalList signals={item.signals} />
                </div>
              )}

              {item.text_stats && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Text statistics</h4>
                  <TextStatsGrid stats={item.text_stats} />
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                AI predictions are probabilistic and should not be treated as definitive proof
                of truthfulness or fraud.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "confidence">("newest");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const pageSize = 10;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open a detail dialog when arriving with ?open=ID
  useEffect(() => {
    const openParam = searchParams.get("open");
    if (openParam && !Number.isNaN(Number(openParam))) {
      setDetailId(Number(openParam));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(
    (q: string, f: string, s: string, p: number) => {
      setLoading(true);
      const params: Parameters<typeof getHistory>[0] = {
        page: p,
        page_size: pageSize,
        sort: s as "newest" | "oldest" | "confidence",
      };
      if (f.startsWith("type:")) params.type = f.split(":")[1];
      if (f.startsWith("pred:")) params.prediction = f.split(":")[1];
      if (q.trim()) params.q = q.trim();
      getHistory(params)
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
        })
        .catch((err) => {
          setItems([]);
          toast.error(err instanceof ApiError ? err.message : "Could not load history.");
        })
        .finally(() => setLoading(false));
    },
    []
  );

  // Reload when filter/sort/page changes
  useEffect(() => {
    load(search, filter, sort, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort, page, load]);

  // Debounced reload when search changes
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      load(search, filter, sort, 1);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDelete(id: number) {
    try {
      await deleteHistoryItem(id);
      toast.success("Analysis deleted.");
      load(search, filter, sort, page);
    } catch {
      toast.error("Could not delete the analysis.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-300">
            <HistoryIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Analysis <span className="text-gradient">History</span>
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Every analysis is stored locally in SQLite. Click a record to inspect the full result.
        </p>
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter analyses">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              aria-pressed={filter === f.key}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f.key
                  ? "border-violet-500/60 bg-violet-600/20 text-violet-200"
                  : "border-border/70 bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by text…"
              aria-label="Search history by text"
              className="pl-9"
              type="search"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Sort analyses">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="confidence">Highest confidence</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {loading && items === null ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : items && items.length === 0 ? (
        <EmptyState
          title="No analyses found"
          description={
            search || filter !== "all"
              ? "No records match the current filters. Try adjusting them."
              : "Run your first analysis from the News or Review detector."
          }
        />
      ) : (
        items && (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-border/70 bg-card/70 md:block scrollbar-thin">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Text preview</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setDetailId(item.id)}
                      className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/30"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 capitalize">
                          {item.type === "news" ? (
                            <Newspaper className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                          ) : (
                            <Star className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
                          )}
                          {item.type}
                        </span>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-muted-foreground">
                        {item.headline ? truncate(item.headline, 60) : truncate(item.input_text, 60)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={PREDICTION_STYLE[item.prediction].variant}>
                          {PREDICTION_STYLE[item.prediction].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatPercent(item.confidence, 1)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete analysis ${item.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-rose-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {items.map((item) => (
                <li key={item.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailId(item.id)}
                    onKeyDown={(e) => e.key === "Enter" && setDetailId(item.id)}
                    className="cursor-pointer rounded-xl border border-border/70 bg-card/70 p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-muted-foreground">
                        {item.type === "news" ? (
                          <Newspaper className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                        ) : (
                          <Star className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
                        )}
                        {item.type}
                      </span>
                      <Badge variant={PREDICTION_STYLE[item.prediction].variant}>
                        {PREDICTION_STYLE[item.prediction].label}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-foreground">
                      {item.headline || item.input_text}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="tabular-nums">{formatPercent(item.confidence, 1)} confidence</span>
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {total} record{total === 1 ? "" : "s"} · page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )
      )}

      <DetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}



