import type { TextStats } from "@/types";

export function TextStatsGrid({ stats }: { stats: TextStats | null }) {
  if (!stats) return null;
  const items = [
    { label: "Words", value: stats.word_count.toLocaleString() },
    { label: "Characters", value: stats.char_count.toLocaleString() },
    { label: "Sentences", value: stats.sentence_count.toLocaleString() },
    { label: "Avg word length", value: stats.avg_word_length.toFixed(1) },
    { label: "Exclamations", value: stats.exclamation_count.toLocaleString() },
    { label: "Questions", value: stats.question_count.toLocaleString() },
    { label: "CAPS ratio", value: `${(stats.all_caps_ratio * 100).toFixed(1)}%` },
    { label: "Unique words", value: `${(stats.unique_word_ratio * 100).toFixed(0)}%` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-center"
        >
          <p className="font-display text-lg font-semibold tabular-nums text-foreground">
            {item.value}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}
