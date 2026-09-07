import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Newspaper, Star } from "lucide-react";
import { getHistory } from "@/services/api";
import type { HistoryItem } from "@/types";
import { formatDateTime, truncate } from "@/lib/utils";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      getHistory({ q: query.trim(), page_size: 5, sort: "newest" })
        .then((res) => {
          setResults(res.items);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        placeholder="Search analyses…"
        aria-label="Search analysis history"
        className="h-9 w-full rounded-lg border border-border/70 bg-input/40 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring"
      />
      {open && (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {loading ? "Searching…" : "No matching analyses found."}
            </p>
          ) : (
            <ul>
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                      navigate(`/history?open=${item.id}`);
                    }}
                  >
                    {item.type === "news" ? (
                      <Newspaper className="h-4 w-4 shrink-0 text-cyan-400" />
                    ) : (
                      <Star className="h-4 w-4 shrink-0 text-violet-400" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {item.headline ? truncate(item.headline, 44) : truncate(item.input_text, 44)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {item.prediction} · {formatDateTime(item.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
