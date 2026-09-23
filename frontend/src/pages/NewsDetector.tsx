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
import { analyzeNews, fetchArticleFromUrl, analyzeNewsUrl, ApiError } from "@/services/api";
import type { NewsAnalysisResult } from "@/types";
import { DEMO_NEWS_MISINFORMATIVE, DEMO_NEWS_REAL } from "@/lib/examples";
import { cn } from "@/lib/utils";

const MAX_HEADLINE = 300;
const MAX_CONTENT = 20000;

const ANALYSIS_STEPS = ["Collecting text features", "Processing NLP features", "Running ML classifier", "Generating result"];

const VIDEO_PATTERNS: RegExp[] = [
  /youtube\.com/i,
  /youtu\.be/i,
  /youtube-nocookie\.com/i,
  /vimeo\.com/i,
  /tiktok\.com/i,
  /vm\.tiktok\.com/i,
  /dailymotion\.com/i,
  /dai\.ly/i,
  /twitch\.tv/i,
  /facebook\.com\/.*\/videos/i,
  /fb\.watch/i,
  /instagram\.com\/(reel|reels|p|tv)/i,
  /rumble\.com/i,
  /bitchute\.com/i,
  /odysee\.com/i,
  /\.(mp4|webm|mov|m3u8)(\?|#|$)/i,
];

function isVideoLink(value: string): boolean {
  const v = (value || "").trim();
  if (!v) return false;
  return VIDEO_PATTERNS.some((re) => re.test(v));
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL((value || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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
  const [headline, setHeadline] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NewsAnalysisResult | null>(null);
  const [fallbackHint, setFallbackHint] = useState<string | null>(null);
  const [, setStepIndex] = useState(0);

  const totalChars = headline.length + content.length;
  // Dynamic mode: text present -> text mode active; URL present -> link mode
  // active. Only one mode drives its Analyze button; empty form disables both.
  const textFilled = useMemo(() => totalChars >= 20, [totalChars]);
  const urlValue = urlInput.trim();
  const urlFilled = useMemo(() => urlValue.length > 0 && isValidHttpUrl(urlValue), [urlValue]);
  const urlIsVideo = useMemo(() => isVideoLink(urlValue), [urlValue]);
  const activeMode: "text" | "link" | null = textFilled ? "text" : urlFilled ? "link" : null;
  const canAnalyzeText = textFilled && !loading && !urlLoading;
  const canAnalyzeUrl = urlFilled && !loading && !urlLoading;
  // Back-compat alias for the text Analyze button.
  const canSubmit = canAnalyzeText;

  const startStepper = () => {
    setStepIndex(0);
    return setInterval(() => {
      setStepIndex((s) => Math.min(s + 1, ANALYSIS_STEPS.length - 1));
    }, 650);
  };

  const finishAnalyze = (response: NewsAnalysisResult, label: string) => {
    setResult(response);
    setFallbackHint(null);
    toast.success(`${label} complete — ${(response.confidence * 100).toFixed(1)}% confidence`);
  };

  const isPasteFallbackError = (message: string): boolean =>
    /javascript/i.test(message) || /paste/i.test(message) || /fallback/i.test(message);

  const showFallbackHint = (message: string, url: string) => {
    // JS-shell pages (MSN/Bing-style): keep the URL as source, guide the user
    // to paste headline + paragraphs manually, then use Analyze Article.
    setFallbackHint(message);
    if (sourceUrl.trim() !== url.trim()) setSourceUrl(url.trim());
    toast.error("No readable text at this URL — paste the article text instead.", { duration: 6000 });
  };

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) {
      toast.error("Please enter a URL or video link to fetch.");
      return;
    }
    setUrlLoading(true);
    setFallbackHint(null);
    try {
      const article = await fetchArticleFromUrl(urlInput.trim());
      const kindLabel = article.is_video || article.kind === "video" ? "Video metadata" : "Article";
      setHeadline(article.headline);
      setContent(article.content);
      setSourceUrl(article.url);
      toast.success(`${kindLabel} fetched! Review the content and click Analyze.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to fetch the article.";
      const failedUrl = urlInput.trim();
      if (err instanceof ApiError && err.status === 422 && isPasteFallbackError(message)) {
        showFallbackHint(`${message} Source kept: ${failedUrl}`, failedUrl);
      } else {
        toast.error(message);
      }
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
    const stepper = startStepper();
    try {
      const response = await analyzeNews({
        headline: headline.trim(),
        content: content.trim(),
        source_url: sourceUrl.trim() || undefined,
      });
      finishAnalyze(response, "Analysis");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Analysis failed. Please try again.";
      toast.error(message);
    } finally {
      clearInterval(stepper);
      setLoading(false);
      setStepIndex(0);
    }
  }

  async function handleAnalyzeUrl() {
    if (!urlFilled) {
      toast.error("Please enter a valid URL or video link to analyze.");
      return;
    }
    setLoading(true);
    setResult(null);
    setFallbackHint(null);
    const stepper = startStepper();
    try {
      // One-shot: backend fetches + analyses (same output shape). Video links
      // (YouTube/Vimeo/...) go to the same endpoint — it detects them there.
      const response = await analyzeNewsUrl(urlValue);
      setHeadline(response.headline || "");
      setSourceUrl(response.source_url || urlValue);
      finishAnalyze(response, urlIsVideo ? "Video analysis" : "URL analysis");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "URL analysis failed. Please try again.";
      if (err instanceof ApiError && err.status === 422 && isPasteFallbackError(message)) {
        showFallbackHint(`${message} Source kept: ${urlValue}`, urlValue);
      } else {
        toast.error(message);
      }
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
    setFallbackHint(null);
  }

  function loadExample(which: "real" | "fake") {
    const example = which === "real" ? DEMO_NEWS_REAL : DEMO_NEWS_MISINFORMATIVE;
    setHeadline(example.headline);
    setContent(example.content);
    setSourceUrl(example.source_url);
    setResult(null);
    setFallbackHint(null);
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
            {/* Dynamic mode status — text OR link, never both */}
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "mb-5 flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] transition-colors",
                activeMode === "text" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                activeMode === "link" && "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
                activeMode === null && "border-border/60 bg-muted/30 text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  activeMode === "text" && "bg-emerald-400",
                  activeMode === "link" && "bg-cyan-400",
                  activeMode === null && "bg-muted-foreground/50"
                )}
                aria-hidden="true"
              />
              {activeMode === "text" ? (
                <span><strong className="font-semibold">Text mode active</strong> — URL field disabled. Fill headline + article, then press “Analyze Article”.</span>
              ) : activeMode === "link" ? (
                <span><strong className="font-semibold">{urlIsVideo ? "Video mode active" : "URL mode active"}</strong> — text fields disabled. Press “Analyze URL” to fetch + analyze in one step.</span>
              ) : (
                <span>Enter <strong className="font-semibold">text</strong> or a <strong className="font-semibold">URL / video link</strong> — the matching Analyze button enables automatically.</span>
              )}
            </div>

            <div className="space-y-5">
              {/* ---- URL / video link section ---- */}
              <motion.section
                aria-label="URL or video link input"
                animate={{ opacity: activeMode === "text" ? 0.45 : 1 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "space-y-4 rounded-xl border p-4 transition-colors",
                  activeMode === "link" ? "border-cyan-500/60 ring-1 ring-cyan-500/40" : "border-border/60"
                )}
              >
                  <div>
                    <Label htmlFor="article-url" className="mb-2 flex items-center gap-2">
                      Article / Video URL
                      {urlIsVideo && (
                        <Badge variant="info" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
                          Video link detected
                        </Badge>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="article-url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com/news/article — or YouTube / Vimeo link"
                        type="url"
                        disabled={activeMode === "text"}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleFetchUrl(); } }}
                      />
                      <Button type="button" onClick={handleFetchUrl} disabled={urlLoading || !urlInput.trim() || activeMode === "text"} className="shrink-0" title="Fetch text to preview (optional)">
                        {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Globe className="h-4 w-4" aria-hidden="true" />}
                        <span className="hidden sm:inline">{urlLoading ? "Fetching…" : "Fetch"}</span>
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Paste a news URL <em>or</em> a video link (YouTube, Vimeo, TikTok…). Video pages go to the same endpoint — titles, descriptions & captions are extracted automatically.
                    </p>
                  </div>

                  <div className="rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 p-3">
                    <p className="flex items-start gap-1.5 text-xs text-cyan-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        <strong className="font-semibold">Server-side fetching:</strong> URLs are fetched through our backend to bypass browser CORS restrictions. Video extraction works best when captions/descriptions are public.
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 border-t border-border/60 pt-4">
                    <Button type="button" onClick={handleAnalyzeUrl} disabled={!canAnalyzeUrl} className="min-w-[150px]">
                      <Globe className="h-4 w-4" aria-hidden="true" />
                      {loading && activeMode === "link" ? "Analyzing…" : urlIsVideo ? "Analyze Video" : "Analyze URL"}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      {!urlFilled ? "Enter a valid http(s) URL to enable." : "Fetches + analyzes in one step — no headline needed."}
                    </span>
                  </div>

                  <AnimatePresence>
                    {fallbackHint && (
                      <motion.div
                        key="paste-fallback"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.25 }}
                        role="alert"
                        className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-[13px] leading-relaxed text-amber-200"
                      >
                        <p className="flex items-start gap-1.5">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            <strong className="font-semibold">Couldn’t read this page automatically.</strong>{" "}
                            {fallbackHint}
                          </span>
                        </p>
                        <p className="mt-2 text-amber-200/90">
                          How to continue: open the URL in your browser, copy the headline + 2–3 paragraphs into the text section below, then press{" "}
                          <strong className="font-semibold">“Analyze Article”</strong>. Your link is kept as Source URL.
                        </p>
                        <div className="mt-2.5">
                          <Button type="button" size="sm" variant="outline" onClick={() => setUrlInput("")}>
                            <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                            Clear URL to unlock text fields
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
              </motion.section>

              {/* ---- OR divider ---- */}
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border/60" />
                <span className="rounded-full border border-border/60 bg-muted/40 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border/60" />
              </div>

              {/* ---- Headline + article text section ---- */}
              <motion.section
                aria-label="Headline and article text input"
                animate={{ opacity: activeMode === "link" ? 0.45 : 1 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "space-y-5 rounded-xl border p-4 transition-colors",
                  activeMode === "text" ? "border-emerald-500/60 ring-1 ring-emerald-500/40" : "border-border/60"
                )}
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
                      disabled={activeMode === "link"}
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
                      disabled={activeMode === "link"}
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
                      disabled={activeMode === "link"}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 border-t border-border/60 pt-4">
                    <Button type="button" onClick={handleAnalyze} disabled={!canSubmit} className="min-w-[150px]" title="Analyze typed headline + article (text mode)">
                      <Gauge className="h-4 w-4" aria-hidden="true" />
                      {loading && activeMode === "text" ? "Analyzing…" : "Analyze Article"}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleClear} disabled={loading || urlLoading}>
                      <Eraser className="h-4 w-4" aria-hidden="true" />
                      Clear
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      {!textFilled ? "Type ≥ 20 characters to enable." : "Headline + article ready — no URL needed."}
                    </span>
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
                      <Button type="button" size="sm" variant="outline" onClick={() => loadExample("fake")} disabled={loading || urlLoading || activeMode === "link"}>
                        Load Example News (fake)
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => loadExample("real")} disabled={loading || urlLoading || activeMode === "link"}>
                        Load Example News (real)
                      </Button>
                    </div>
                  </div>
              </motion.section>
            </div>
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
                {activeMode === "link"
                  ? "Video / URL detected. Press “Analyze URL” — the backend fetches titles, descriptions & captions and runs the same AI classifier."
                  : "Paste an article and press Analyze Article, or paste a URL / video link and press Analyze URL. Groq estimates whether the text looks real or potentially misinformative."}
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



