import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Newspaper,
  Sparkles,
  Eraser,
  Gauge,
  Timer,
  Brain,
  Smile,
  Frown,
  Meh,
  AlertTriangle,
  FlaskConical,
  RotateCcw,
  Link,
  Globe,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceRing } from "@/components/ConfidenceRing";
import { AnalysisStepper } from "@/components/AnalysisStepper";
import { SignalList } from "@/components/SignalList";
import { TextStatsGrid } from "@/components/TextStatsGrid";
import { analyzeNews, fetchArticleFromUrl, ApiError } from "@/services/api";
import type { NewsAnalysisResult } from "@/types";
import { DEMO_NEWS_MISINFORMATIVE, DEMO_NEWS_REAL } from "@/lib/examples";
import { cn } from "@/lib/utils";

const MAX_HEADLINE = 300;
const MAX_CONTENT = 20000;

const ANALYSIS_STEPS = ["Collecting text features", "Processing NLP features", "Running ML classifier", "Generating result"];

type InputMode = "paste" | "url";

function VerdictCard({ result }: { result: NewsAnalysisResult }) {
  const isMisinformative = result.prediction === "misinformative";
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="overflow-hidden rounded-xl border border-border/70 bg-card/70"
    >
      {/* verdict banner */}
      <div
        className={cn(
          "relative overflow-hidden p-6",
          isMisinformative
            ? "bg-gradient-to-br from-rose-600/25 via-rose-500/10 to-transparent"
            : "bg-gradient-to-br from-emerald-600/25 via-emerald-500/10 to-transparent"
        )}
      >
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
          <ConfidenceRing
            value={result.confidence}
            tone={isMisinformative ? "danger" : "success"}
            label="Confidence"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              AI Classification
            </p>
            <h2
              className={cn(
                "mt-1 font-display text-2xl font-bold md:text-3xl",
                isMisinformative ? "text-rose-300" : "text-emerald-300"
              )}
            >
              {isMisinformative ? "POTENTIALLY MISINFORMATIVE" : "LIKELY REAL"}
            </h2>
            <p className="mt-2 flex items-start justify-center gap-1.5 text-[13px] leading-relaxed text-muted-foreground sm:justify-start">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {result.disclaimer}
            </p>
          </div>
        </div>
      </div>

      {/* meta grid */}
      <div className="grid grid-cols-2 gap-3 border-t border-border/60 p-5 md:grid-cols-4">
        {[
          { icon: Brain, label: "Model", value: result.model },
          { icon: Timer, label: "Processing", value: `${result.processing_time_ms} ms` },
          { icon: FlaskConical, label: "Prediction", value: isMisinformative ? "Misinformative" : "Real" },
          { icon: Smile, label: "Sentiment", value: result.sentiment },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border/50 bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <m.icon className="h-3 w-3" aria-hidden="true" /> {m.label}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground" title={m.value}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* why this result */}
      <div className="border-t border-border/60 p-5">
        <h3 className="mb-3 font-display text-base font-semibold">
          Why this result?
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Potential signals detected — indicators, not proof
          </span>
        </h3>
        <SignalList signals={result.signals} />
      </div>

      {/* text statistics */}
      <div className="border-t border-border/60 p-5">
        <h3 className="mb-3 font-display text-base font-semibold">Text statistics</h3>
        <TextStatsGrid stats={result.text_stats} />
      </div>
    </motion.div>
  );
}
export default function NewsDetector() {
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [headline, setHeadline] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NewsAnalysisResult | null>(null);
  const [, setStepIndex] = useState(0);

  const totalChars = headline.length + content.length;
  const canSubmit = useMemo(() => totalChars >= 20 && !loading, [totalChars, loading]);

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) {
      toast.error("Please enter a URL to fetch.");
      return;
    }
    setUrlLoading(true);
    try {
      const article = await fetchArticleFromUrl(urlInput.trim());
      setHeadline(article.headline);
      setContent(article.content);
      setSourceUrl(article.url);
      setInputMode("paste");
      toast.success("Article fetched! Review the content and click Analyze.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to fetch the article.";
      toast.error(message);
    } finally {
      setUrlLoading(false);
    }
  };

  async function handleAnalyze() {
    if (totalChars < 20) {
      toast.error("Please provide at least 20 characters of headline or article text.");
      return;
    }
    setLoading(true);
    setResult(null);
    const stepper = setInterval(() => {
      setStepIndex((s) => Math.min(s + 1, ANALYSIS_STEPS.length - 1));
    }, 650);
    try {
      const response = await analyzeNews({
        headline: headline.trim(),
        content: content.trim(),
        source_url: sourceUrl.trim() || undefined,
      });
      setResult(response);
      toast.success(`Analysis complete — ${(response.confidence * 100).toFixed(1)}% confidence`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Analysis failed. Please try again.";
      toast.error(message);
    } finally {
      clearInterval(stepper);
      setLoading(false);
      setStepIndex(0);
    }
  }

  function handleClear() {
    setHeadline("");
    setContent("");
    setSourceUrl("");
    setUrlInput("");
    setResult(null);
  }

  function loadExample(which: "real" | "fake") {
    const example = which === "real" ? DEMO_NEWS_REAL : DEMO_NEWS_MISINFORMATIVE;
    setHeadline(example.headline);
    setContent(example.content);
    setSourceUrl(example.source_url);
    setResult(null);
    setInputMode("paste");
    toast.info("Demo example loaded — it will go through the real ML pipeline.");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-300">
            <Newspaper className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            News Misinformation <span className="text-gradient">Detector</span>
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
          Analyze an article, headline, or news content using the AI classification engine.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Input panel */}
        <Card className="h-fit xl:col-span-2">
          <CardContent className="p-6">
            {/* Tab toggle */}
            <div className="mb-5 flex rounded-lg border border-border/60 bg-background/40 p-1">
              <button
                type="button"
                onClick={() => setInputMode("paste")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  inputMode === "paste"
                    ? "bg-violet-600 text-white shadow-md shadow-violet-950/30"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Newspaper className="h-4 w-4" aria-hidden="true" />
                Paste Article
              </button>
              <button
                type="button"
                onClick={() => setInputMode("url")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  inputMode === "url"
                    ? "bg-violet-600 text-white shadow-md shadow-violet-950/30"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Link className="h-4 w-4" aria-hidden="true" />
                Analyze URL
              </button>
            </div>

            <AnimatePresence mode="wait">
              {inputMode === "url" ? (
                <motion.div
                  key="url-panel"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div>
                    <Label htmlFor="article-url" className="mb-2 block">Article URL</Label>
                    <div className="flex gap-2">
                      <Input
                        id="article-url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com/news/article"
                        type="url"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleFetchUrl(); } }}
                      />
                      <Button type="button" onClick={handleFetchUrl} disabled={urlLoading || !urlInput.trim()} className="shrink-0">
                        {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Globe className="h-4 w-4" aria-hidden="true" />}
                        <span className="hidden sm:inline">{urlLoading ? "Fetching…" : "Fetch"}</span>
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Paste a news article URL. The system will fetch and extract the article content automatically.
                    </p>
                  </div>

                  <div className="rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 p-3">
                    <p className="flex items-start gap-1.5 text-xs text-cyan-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        <strong className="font-semibold">Server-side fetching:</strong> URLs are fetched through our backend to bypass browser CORS restrictions. Extraction works best with standard news article pages.
                      </span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      DEMO EXAMPLES
                      <span className="font-normal text-muted-foreground">— loaded text runs through the real ML pipeline</span>
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => loadExample("fake")} disabled={loading || urlLoading}>
                        Load Example News (fake)
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => loadExample("real")} disabled={loading || urlLoading}>
                        Load Example News (real)
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="paste-panel"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor="headline">Headline</Label>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {headline.length}/{MAX_HEADLINE}
                      </span>
                    </div>
                    <Input
                      id="headline"
                      value={headline}
                      maxLength={MAX_HEADLINE}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder="Paste the article headline…"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor="content">Article content</Label>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {content.length}/{MAX_CONTENT}
                      </span>
                    </div>
                    <Textarea
                      id="content"
                      value={content}
                      maxLength={MAX_CONTENT}
                      onChange={(e) => setContent(e.target.value)}
                      rows={9}
                      placeholder="Paste the full article text here…"
                      className="resize-y"
                      aria-describedby="news-char-counter"
                    />
                    <p id="news-char-counter" className="mt-1.5 text-[11px] text-muted-foreground">
                      Total: {totalChars} characters {totalChars < 20 && "· minimum 20 required"}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="source-url" className="mb-2 block">
                      Source URL <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="source-url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://…"
                      type="url"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 border-t border-border/60 pt-4">
                    <Button type="button" onClick={handleAnalyze} disabled={!canSubmit} className="min-w-[150px]">
                      <Gauge className="h-4 w-4" aria-hidden="true" />
                      {loading ? "Analyzing…" : "Analyze Article"}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleClear} disabled={loading || urlLoading}>
                      <Eraser className="h-4 w-4" aria-hidden="true" />
                      Clear
                    </Button>
                  </div>

                  <div className="rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      DEMO EXAMPLES
                      <span className="font-normal text-muted-foreground">
                        — loaded text runs through the real ML pipeline
                      </span>
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => loadExample("fake")} disabled={loading || urlLoading}>
                        Load Example News (fake)
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => loadExample("real")} disabled={loading || urlLoading}>
                        Load Example News (real)
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Result panel */}
        <div className="space-y-5 xl:col-span-3">
          <AnimatePresence mode="wait">
            {loading && <AnalysisStepper key="stepper" active />}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {result && !loading && <VerdictCard key={result.id} result={result} />}
          </AnimatePresence>

          {!result && !loading && (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center">
              <div className="relative mb-5 overflow-hidden rounded-xl border border-border/70 bg-card p-4">
                <div className="absolute inset-x-0 top-0 h-8 animate-scan bg-gradient-to-b from-cyan-400/30 to-transparent" aria-hidden="true" />
                <Newspaper className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-semibold">AI analysis result</h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                {inputMode === "url"
                  ? "Paste a news article URL and click Fetch. After the content is extracted, review it and press Analyze."
                  : "Paste an article and press Analyze Article. The classifier (TF-IDF + Logistic Regression) will estimate whether the text looks real or potentially misinformative."}
              </p>
              <Button variant="ghost" size="sm" className="mt-4" onClick={() => loadExample("fake")}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Try a demo example
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



