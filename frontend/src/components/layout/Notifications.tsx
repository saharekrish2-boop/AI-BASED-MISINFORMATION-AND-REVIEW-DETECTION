import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Newspaper, Star } from "lucide-react";
import { getHistory } from "@/services/api";
import type { HistoryItem } from "@/types";
import { formatDateTime, truncate } from "@/lib/utils";

export function Notifications() {
  const [open, setOpen] = useState(false);
  const [flagged, setFlagged] = useState<HistoryItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    getHistory({ prediction: "flagged", page_size: 6, sort: "newest" })
      .then((res) => setFlagged(res.items))
      .catch(() => setFlagged([]));
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications for flagged content"
        className="relative rounded-lg border border-border/70 bg-card/60 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-[18px] w-[18px]" />
        {flagged.length > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {flagged.length > 9 ? "9+" : flagged.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
          <div className="border-b border-border px-4 py-2.5">
            <p className="font-display text-sm font-semibold">Flagged content</p>
            <p className="text-[11px] text-muted-foreground">
              Recent analyses classified as potentially problematic
            </p>
          </div>
          {flagged.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              Nothing flagged yet — run an analysis to see results here.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto scrollbar-thin">
              {flagged.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/history?open=${item.id}`}
                    onClick={() => setOpen(false)}
                    className="block border-b border-border/50 px-4 py-2.5 text-sm hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      {item.type === "news" ? (
                        <Newspaper className="h-3.5 w-3.5 text-cyan-400" />
                      ) : (
                        <Star className="h-3.5 w-3.5 text-violet-400" />
                      )}
                      <span className="truncate text-foreground">
                        {item.headline ? truncate(item.headline, 34) : truncate(item.input_text, 34)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {item.prediction} · {(item.confidence * 100).toFixed(1)}% ·{" "}
                      {formatDateTime(item.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
