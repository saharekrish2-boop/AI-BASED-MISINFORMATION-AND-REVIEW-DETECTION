import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Newspaper,
  Star,
  Smile,
  ScanSearch,
  History as HistoryIcon,
  BarChart3,
  ShieldCheck,
  FileInput,
  Cpu,
  BrainCircuit,
  Eye,
  Lock,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEMO_NEWS_REAL, DEMO_REVIEW_GENUINE } from "@/lib/examples";

const HOW_IT_WORKS = [
  {
    icon: FileInput,
    title: "1. Submit Content",
    text: "Paste an article or a customer review. No setup, no API keys — the entire analysis runs on your machine.",
  },
  {
    icon: ScanSearch,
    title: "2. NLP Processing",
    text: "Text is cleaned, tokenised and vectorised with TF-IDF while lexical features such as punctuation, capitalisation and sentiment are measured.",
  },
  {
    icon: Cpu,
    title: "3. AI Classification",
    text: "A logistic regression model trained with scikit-learn estimates the probability the content belongs to each class.",
  },
  {
    icon: BrainCircuit,
    title: "4. Explainable Result",
    text: "Every prediction is returned with a confidence score and a set of potential signals derived from the actual text — never random.",
  },
];

const CAPABILITIES = [
  { icon: Newspaper, title: "News Detection", text: "Classify articles as LIKELY REAL or POTENTIALLY MISINFORMATIVE." },
  { icon: Star, title: "Review Detection", text: "Flag reviews that look GENUINE or SUSPICIOUS based on language patterns." },
  { icon: Smile, title: "Sentiment Analysis", text: "Lexicon-based positive / neutral / negative sentiment for every text." },
  { icon: Eye, title: "Explainable Signals", text: "Why this result? — transparent, text-derived indicators shown with every verdict." },
  { icon: HistoryIcon, title: "Analysis History", text: "Every run is persisted to SQLite and searchable from the history page." },
  { icon: BarChart3, title: "Analytics", text: "Live charts built entirely from your real analysis records." },
];
// Simplified animated mock of the analysis interface (purely decorative hero visual)
function HeroVisual() {
  const newsExample = DEMO_NEWS_REAL.headline;
  const reviewExample = DEMO_REVIEW_GENUINE.review_text.slice(0, 96) + "…";
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-violet-600/25 via-transparent to-cyan-500/25 blur-2xl" aria-hidden="true" />

      <div className="glass rounded-2xl p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-foreground">Live analysis console</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            engine online
          </span>
        </div>

        {/* News card */}
        <div className="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-muted/30 p-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 animate-scan bg-gradient-to-b from-cyan-400/25 to-transparent" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">News analysis</p>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-foreground">{newsExample}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Scanning text features…</span>
            <Badge variant="success">LIKELY REAL · 94%</Badge>
          </div>
        </div>

        {/* Review card */}
        <div className="mt-3 rounded-xl border border-violet-500/20 bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-violet-300" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">Review analysis</p>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-foreground">{reviewExample}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Checking promotional language…</span>
            <Badge variant="success">LIKELY GENUINE · 88%</Badge>
          </div>
        </div>

        {/* signals row */}
        <div className="mt-4 rounded-xl border border-border/60 bg-card/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Potential signals</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Neutral tone", "Sourcing present", "Specific details", "Positive sentiment"].map((s) => (
              <span key={s} className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] text-foreground">
                <ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-400" aria-hidden="true" />
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* floating chips */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className="absolute -left-4 -top-4 hidden rounded-xl border border-border/70 bg-card/90 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur sm:block"
      >
        <Eye className="mr-1 inline h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
        TF-IDF → LM
      </motion.div>
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 0.6 }}
        className="absolute -bottom-4 -right-4 hidden rounded-xl border border-border/70 bg-card/90 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur sm:block"
      >
        <Lock className="mr-1 inline h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
        Private · no cloud
      </motion.div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden grid-bg">
      {/* subtle gradient orbs */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-violet-600/15 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 top-40 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden="true" />

      {/* Top nav */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/dashboard">Dashboard</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/dashboard">
              Launch App
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6">
        <section className="grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Badge variant="info" className="mb-5">
              <ScanSearch className="h-3 w-3" aria-hidden="true" />
              On-device AI · no paid APIs
            </Badge>
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Detect Misinformation.
              <br />
              <span className="text-gradient">Understand Suspicious Reviews.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              AI-powered text analysis for identifying potentially misleading news and
              suspicious customer reviews — with explainable, confidence-scored results.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/news">
                  <Newspaper className="h-5 w-5" aria-hidden="true" />
                  Analyze News
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link to="/reviews">
                  <Star className="h-5 w-5" aria-hidden="true" />
                  Analyze Reviews
                </Link>
              </Button>
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              Predictions are probabilistic, never absolute proof.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <HeroVisual />
          </motion.div>
        </section>
{/* How it works */}
        <section className="pb-16 pt-10 lg:pt-14">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              How It <span className="text-gradient">Works</span>
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
              A transparent pipeline — every step runs locally and every result explains itself.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.08 }}
                className="group rounded-xl border border-border/70 bg-card/70 p-5 transition-colors hover:border-primary/40"
              >
                <div className="rounded-lg bg-gradient-to-br from-violet-600/20 to-cyan-500/10 p-2.5 text-violet-300 w-fit">
                  <step.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-3.5 font-display text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Capabilities */}
        <section className="pb-16 pt-4">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Capabilities
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
              Everything you need to investigate text at scale — fully on your own machine.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((cap, i) => (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.06 }}
                className="flex items-start gap-3.5 rounded-xl border border-border/70 bg-card/70 p-5 transition-colors hover:border-primary/40"
              >
                <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-300 shrink-0">
                  <cap.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-foreground">{cap.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{cap.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
          <Logo size={28} />
          <p className="text-center text-xs text-muted-foreground">
            TruthLens AI · AI predictions are probabilistic and should not be treated as
            definitive proof of truthfulness or fraud.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">
              Enter Dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}