import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Star,
  Sparkles,
  Eraser,
  Gauge,
  Timer,
  Brain,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  AlertTriangle,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfidenceRing } from "@/components/ConfidenceRing";
import { AnalysisStepper } from "@/components/AnalysisStepper";
import { SignalList } from "@/components/SignalList";
import { TextStatsGrid } from "@/components/TextStatsGrid";
import { analyzeReview, ApiError } from "@/services/api";
import type { ReviewAnalysisResult, Sentiment } from "@/types";
import { DEMO_REVIEW_GENUINE, DEMO_REVIEW_SUSPICIOUS } from "@/lib/examples";
import { cn } from "@/lib/utils";

const MAX_REVIEW = 10000;

const SENTIMENT_STYLE: Record<Sentiment, { label: string; cls: string; icon: typeof ThumbsUp }> = {
  positive: { label: "Positive", cls: "text-emerald-300 bg-emerald-500/10", icon: ThumbsUp },
  neutral: { label: "Neutral", cls: "text-cyan-300 bg-cyan-500/10", icon: MinusCircle },
  negative: { label: "Negative", cls: "text-rose-300 bg-rose-500/10", icon: ThumbsDown },
};

function VerdictCard({ result }: { result: ReviewAnalysisResult }) {
  const isSuspicious = result.prediction === "suspicious";
  const sentiment = SENTIMENT_STYLE[result.sentiment];
  const SentIcon = sentiment.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="overflow-hidden rounded-xl border border-border/70 bg-card/70"
    >
      <div
        className={cn(
          "p-6",
          isSuspicious
            ? "bg-gradient-to-br from-orange-600/25 via-orange-500/10 to-transparent"
            : "bg-gradient-to-br from-emerald-600/25 via-emerald-500/10 to-transparent"
        )}
      >
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
          <ConfidenceRing
            value={result.confidence}
            tone={isSuspicious ? "warning" : "success"}
            label="Confidence"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              AI Classification
            </p>
            <h2
              className={cn(
                "mt-1 font-display text-2xl font-bold md:text-3xl",
                isSuspicious ? "text-orange-300" : "text-emerald-300"
              )}
            >
              {isSuspicious ? "SUSPICIOUS" : "LIKELY GENUINE"}
            </h2>
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", sentiment.cls)}>
                <SentIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Sentiment: {sentiment.label}
              </span>
              {result.verified_purchase !== null && (
                <Badge variant={result.verified_purchase ? "success" : "muted"}>
                  {result.verified_purchase ? "Verified purchase" : "Not verified"}
                </Badge>
              )}
              {result.rating !== null && <Badge variant="info">{result.rating}/5 rating</Badge>}
            </div>
            <p className="mt-2 flex items-start justify-center gap-1.5 text-[13px] leading-relaxed text-muted-foreground sm:justify-start">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {result.disclaimer}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border/60 p-5 md:grid-cols-4">
        {[
          { icon: Brain, label: "Model", value: result.model },
          { icon: Timer, label: "Processing", value: `${result.processing_time_ms} ms` },
          { icon: FlaskConical, label: "Prediction", value: isSuspicious ? "Suspicious" : "Genuine" },
          { icon: Star, label: "Product", value: result.product_name || "Not specified" },
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

      <div className="border-t border-border/60 p-5">
        <h3 className="mb-3 font-display text-base font-semibold">
          Suspicion indicators
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Potential signals detected — indicators, not proof
          </span>
        </h3>
        <SignalList signals={result.signals} />
      </div>

      <div className="border-t border-border/60 p-5">
        <h3 className="mb-3 font-display text-base font-semibold">Text statistics</h3>
        <TextStatsGrid stats={result.text_stats} />
      </div>
    </motion.div>
  );
}
export default function ReviewDetector() {
  const [reviewText, setReviewText] = useState("");
  const [productName, setProductName] = useState("");
  const [rating, setRating] = useState<string>("none");
  const [verified, setVerified] = useState(false);
  const [useVerified, setUseVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewAnalysisResult | null>(null);

  const canSubmit = useMemo(() => reviewText.trim().length >= 10 && !loading, [reviewText, loading]);

  async function handleAnalyze() {
    if (reviewText.trim().length < 10) {
      toast.error("Please enter at least 10 characters of review text.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await analyzeReview({
        review_text: reviewText.trim(),
        product_name: productName.trim() || undefined,
        rating: rating !== "none" ? Number(rating) : undefined,
        verified_purchase: useVerified ? verified : undefined,
      });
      setResult(response);
      toast.success(`Analysis complete — ${(response.confidence * 100).toFixed(1)}% confidence`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Analysis failed. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setReviewText("");
    setProductName("");
    setRating("none");
    setVerified(false);
    setUseVerified(false);
    setResult(null);
  }

  function loadExample(which: "genuine" | "suspicious") {
    const example = which === "genuine" ? DEMO_REVIEW_GENUINE : DEMO_REVIEW_SUSPICIOUS;
    setReviewText(example.review_text);
    setProductName(example.product_name);
    setRating(String(example.rating));
    setVerified(example.verified_purchase);
    setUseVerified(true);
    setResult(null);
    toast.info("Demo example loaded — it will go through the real ML pipeline.");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-300">
            <Star className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Fake Review <span className="text-gradient">Detector</span>
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
          Analyze customer reviews and identify language patterns associated with
          suspicious or potentially fake reviews.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="h-fit xl:col-span-2">
          <CardContent className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) handleAnalyze();
              }}
              className="space-y-5"
            >
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label htmlFor="review-text">Review text</Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {reviewText.length}/{MAX_REVIEW}
                  </span>
                </div>
                <Textarea
                  id="review-text"
                  value={reviewText}
                  maxLength={MAX_REVIEW}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={8}
                  placeholder="Paste the customer review here…"
                  className="resize-y"
                  aria-describedby="review-char-counter"
                />
                <p id="review-char-counter" className="mt-1.5 text-[11px] text-muted-foreground">
                  {reviewText.trim().length} characters{" "}
                  {reviewText.trim().length > 0 && reviewText.trim().length < 10 && "· minimum 10 required"}
                </p>
              </div>

              <div>
                <Label htmlFor="product-name" className="mb-2 block">
                  Product / service name <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="product-name"
                  value={productName}
                  maxLength={200}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. SoundCore-X wireless earbuds"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rating" className="mb-2 block">
                    Rating <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Select value={rating} onValueChange={setRating}>
                    <SelectTrigger id="rating" aria-label="Review rating">
                      <SelectValue placeholder="Select rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {[1, 2, 3, 4, 5].map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {r} star{r > 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col justify-center">
                  <Label htmlFor="verified" className="mb-2 block">
                    Verified purchase <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="verified"
                      checked={useVerified ? verified : false}
                      onCheckedChange={(v) => {
                        setUseVerified(true);
                        setVerified(v);
                      }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {useVerified ? (verified ? "Verified" : "Not verified") : "Not specified"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 border-t border-border/60 pt-4">
                <Button type="submit" disabled={!canSubmit} className="min-w-[150px]">
                  <Gauge className="h-4 w-4" aria-hidden="true" />
                  {loading ? "Analyzing…" : "Analyze Review"}
                </Button>
                <Button type="button" variant="outline" onClick={handleClear} disabled={loading}>
                  <Eraser className="h-4 w-4" aria-hidden="true" />
                  Clear
                </Button>
              </div>

              <div className="rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  DEMO EXAMPLE
                  <span className="font-normal text-muted-foreground">
                    — loaded text runs through the real ML pipeline
                  </span>
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => loadExample("suspicious")} disabled={loading}>
                    Load Example Review (suspicious)
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => loadExample("genuine")} disabled={loading}>
                    Load Example Review (genuine)
                  </Button>
                </div>
              </div>
            </form>
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
                <div className="absolute inset-x-0 top-0 h-8 animate-scan bg-gradient-to-b from-violet-400/30 to-transparent" aria-hidden="true" />
                <Star className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-semibold">AI analysis result</h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                Paste a review and press <strong>Analyze Review</strong>. Sentiment,
                language patterns and model features are combined into an explainable verdict.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



