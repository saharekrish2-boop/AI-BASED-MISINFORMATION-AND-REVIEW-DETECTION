"""Lightweight, rule-based explainability + text analytics for TruthLens AI.

Every signal produced here is derived from measurable properties of the
submitted text: word-bank hits, punctuation statistics, capitalisation
ratios, repetition checks, sentiment-lexicon analysis and rating/sentiment
agreement, combined with the Groq verdict (prediction, confidence,
flags, explanation). Nothing is randomised.

The signals are *potential indicators*, not proof (see wording below).
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Optional

# ---------------------------------------------------------------------------
# Word banks
# ---------------------------------------------------------------------------
POSITIVE_WORDS = {
    "good", "great", "excellent", "amazing", "awesome", "love", "loved", "lovely",
    "perfect", "best", "fantastic", "wonderful", "happy", "pleased", "satisfied",
    "recommend", "recommended", "impressive", "brilliant", "superb", "outstanding",
    "reliable", "smooth", "fast", "beautiful", "comfortable", "durable", "helpful",
    "friendly", "worth", "quality", "enjoy", "enjoyed", "delighted", "pleasant",
    "sturdy", "convenient", "efficient", "glad", "favorite", "favourite", "solid",
    "works", "flawless", "superior", "promt", "prompt", "exceptional", "stellar",
}
NEGATIVE_WORDS = {
    "bad", "terrible", "awful", "horrible", "worst", "hate", "hated", "disappointed",
    "disappointing", "broken", "broke", "poor", "useless", "waste", "defective",
    "damaged", "slow", "ugly", "uncomfortable", "annoying", "faulty", "crashed",
    "crash", "problem", "problems", "issue", "issues", "refund", "flimsy", "cheap",
    "fragile", "unreliable", "frustrating", "frustrated", "regret", "unusable",
    "mediocre", "lacking", "failed", "failure", "junk", "garbage", "pathetic",
    "dissatisfied", "unhappy", "misleading", "scam", "stained", "smelled",
}
NEGATORS = {
    "not", "no", "never", "none", "nobody", "nothing", "neither", "nor", "cannot",
    "can't", "dont", "doesn't", "didn't", "isn't", "wasn't", "won't", "wouldn't",
    "couldn't", "shouldn't", "hardly", "barely", "without", "lack", "lacks",
}

SENSATIONAL_WORDS = {
    "shocking", "unbelievable", "miracle", "exposed", "secret", "secrets",
    "conspiracy", "cover-up", "coverup", "banned", "leaked", "insane",
    "jaw-dropping", "mind-blowing", "bombshell", "explosive", "outrageous",
    "scandal", "warning", "destroyed", "slams", "hate", "forbidden", "hidden",
    "censored", "furious", "stunned", "truth", "viral", "proves", "hoax",
    "wake", "desperate", "terrifying", "horrific", "sensational", "bombshell",
}
STRONG_CLAIM_WORDS = {
    "cure", "cures", "cured", "guaranteed", "guarantee", "instantly", "overnight",
    "breakthrough", "impossible", "everyone", "nobody", "always", "never",
    "proven", "definitive", "irrefutable", "undeniable",
}
OBJECTIVITY_MARKERS = {
    "according", "reported", "sources", "officials", "statement", "analysis",
    "data", "researchers", "study", "review", "audit", "spokesperson", "briefing",
    "estimates", "survey", "commission", "agency", "authority", "ministry",
}
CLICKBAIT_PATTERNS = [
    r"you won'?t believe", r"what happens next", r"this one (?:weird )?trick",
    r"doctors (?:hate|are begging)", r"going viral", r"won'?t believe",
    r"insiders? reveal", r"leaked? (?:documents?|photos?|videos?|recordings?)",
    r"before it'?s? (?:deleted|removed|too late)", r"share this before",
]
PROMO_PHRASES = [
    "best ever", "life changing", "life-changing", "must have", "must-have",
    "10/10", "11/10", "game changer", "game-changer", "holy grail",
    "miracle product", "buy it now", "don't think twice", "thank me later",
    "#1", "five stars is not enough", "worth every penny", "you need this",
    "everyone needs", "changed my life", "absolute perfection", "unbeatable",
    "outdid themselves", "hands down", "no competition", "flawless", "just buy",
]
GENERIC_PRAISE = {
    "good", "great", "nice", "amazing", "awesome", "perfect", "excellent",
    "love", "loved", "best", "wonderful", "fantastic", "incredible", "wow",
}
SPECIFICITY_MARKERS = {
    "battery", "shipping", "warranty", "packaging", "delivery", "setup",
    "instructions", "manual", "support", "refund", "size", "color", "colour",
    "weight", "charger", "cable", "app", "bluetooth", "material", "fabric",
    "weeks", "week", "months", "month", "days", "day", "years", "year", "hours",
}

SENTENCE_SPLIT_RE = re.compile(r"[.!?\n]+")
CAPS_WORD_RE = re.compile(r"\b[A-Z]{2,}\b")

# ---------------------------------------------------------------------------
# Sentiment analysis (lexicon + negation, lightweight, offline)
# ---------------------------------------------------------------------------

def analyze_sentiment(text: str) -> dict:
    """Return {'label', 'score', 'positive_hits', 'negative_hits'}.

    Lexicon-based with simple negation handling; fully deterministic.
    """
    words = re.findall(r"[a-zA-Z']+", (text or "").lower())
    pos_hits = neg_hits = 0
    for i, word in enumerate(words):
        window = words[max(0, i - 3):i]
        negated = any(w in NEGATORS for w in window)
        if word in POSITIVE_WORDS:
            if negated:
                neg_hits += 1
            else:
                pos_hits += 1
        elif word in NEGATIVE_WORDS:
            if negated:
                pos_hits += 1
            else:
                neg_hits += 1

    total = pos_hits + neg_hits
    if total == 0:
        return {"label": "neutral", "score": 0.0, "positive_hits": 0, "negative_hits": 0}
    raw = (pos_hits - neg_hits) / math.sqrt(total)
    score = max(-1.0, min(1.0, raw))
    if score > 0.15:
        label = "positive"
    elif score < -0.15:
        label = "negative"
    else:
        label = "neutral"
    return {
        "label": label,
        "score": round(score, 3),
        "positive_hits": pos_hits,
        "negative_hits": neg_hits,
    }
# ---------------------------------------------------------------------------
# Text statistics
# ---------------------------------------------------------------------------

def text_statistics(text: str) -> dict:
    """Compute measurable statistics for a text."""
    text = text or ""
    words = re.findall(r"[A-Za-z']+", text)
    word_count = len(words)
    sentences = [s for s in SENTENCE_SPLIT_RE.split(text) if s.strip()]
    caps_words = CAPS_WORD_RE.findall(text)
    letters = [c for c in text if c.isalpha()]
    caps_letters = [c for c in letters if c.isupper()]
    lower_words = [w.lower() for w in words]
    return {
        "word_count": word_count,
        "char_count": len(text),
        "sentence_count": len(sentences),
        "avg_word_length": round(sum(len(w) for w in words) / word_count, 2) if word_count else 0.0,
        "exclamation_count": text.count("!"),
        "question_count": text.count("?"),
        "all_caps_ratio": round(len(caps_letters) / len(letters), 3) if letters else 0.0,
        "unique_word_ratio": round(len(set(lower_words)) / word_count, 3) if word_count else 0.0,
        "caps_word_count": len(caps_words),
    }


def _repeated_ngrams(text: str, n: int, min_repeats: int) -> Optional[str]:
    """Find the first n-gram repeated >= min_repeats times (if any)."""
    words = re.findall(r"[a-z']+", text.lower())
    if len(words) < n * min_repeats:
        return None
    grams = [" ".join(words[i:i + n]) for i in range(len(words) - n + 1)]
    counts = Counter(grams)
    for gram, count in counts.most_common(1):
        if count >= min_repeats:
            return gram
    return None


def _sig(sig_id: str, title: str, description: str, severity: str) -> dict:
    return {"id": sig_id, "title": title, "description": description, "severity": severity}


_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3, "positive": 4}
# ---------------------------------------------------------------------------
# NEWS signals
# ---------------------------------------------------------------------------

def news_signals(
    headline: str,
    content: str,
    prediction: str,
    confidence: float,
    stats: dict,
    source_url: Optional[str] = None,
    groq_flags: Optional[list] = None,
    groq_explanation: str = "",
) -> list[dict]:
    """Build explainable signals for a news analysis from real text features."""
    full = f"{headline}\n{content}".strip() if headline else content
    words = re.findall(r"[A-Za-z']+", full.lower())
    word_count = stats["word_count"]
    signals: list[dict] = []

    # 1. Sensational / emotionally loaded vocabulary
    sensational_hits = sorted({w for w in words if w in SENSATIONAL_WORDS})
    if len(sensational_hits) >= 3:
        signals.append(_sig(
            "sensational-language", "High sensational language",
            f"Found {len(sensational_hits)} emotionally charged terms "
            f"({', '.join(sensational_hits[:6])}) that are typical of clickbait "
            "or sensationalised reporting.",
            "high",
        ))
    elif len(sensational_hits) in (1, 2):
        signals.append(_sig(
            "mild-sensational-language", "Emotionally charged wording",
            f"A few charged terms were used ({', '.join(sensational_hits[:4])}). "
            "Occasional emotional wording is common in opinion pieces.",
            "low",
        ))

    # 2. Punctuation / shouting
    if stats["exclamation_count"] >= 3:
        signals.append(_sig(
            "excessive-punctuation", "Excessive punctuation",
            f"The text contains {stats['exclamation_count']} exclamation marks — "
            "professional news copy rarely uses any.",
            "high" if stats["exclamation_count"] >= 6 else "medium",
        ))
    if stats["caps_word_count"] >= 3 and stats["all_caps_ratio"] > 0.08:
        signals.append(_sig(
            "heavy-capitalisation", "Heavy capitalisation",
            f"{stats['caps_word_count']} words are written in ALL CAPS "
            f"({stats['all_caps_ratio']:.0%} of letters), a common emphasis "
            "tactic in viral misinformation.",
            "medium",
        ))

    # 3. Clickbait headline structure
    clickbait_hits = [p for p in CLICKBAIT_PATTERNS if re.search(p, full.lower())]
    if clickbait_hits:
        signals.append(_sig(
            "clickbait-structure", "Clickbait headline structure",
            "Phrasing such as \"you won't believe\", \"what happens next\" or "
            "\"insiders reveal\" is designed to provoke curiosity rather than inform.",
            "high",
        ))

    # 4. Unusually strong claims
    strong_hits = sorted({w for w in words if w in STRONG_CLAIM_WORDS})
    if len(strong_hits) >= 2:
        signals.append(_sig(
            "strong-claims", "Unusually strong claims",
            f"Absolute claims detected ({', '.join(strong_hits[:6])}) without "
            "supporting context — credible reporting usually qualifies its claims.",
            "medium",
        ))

    # 5. Sourcing / attribution
    objectivity_hits = sum(1 for w in words if w in OBJECTIVITY_MARKERS)
    if objectivity_hits == 0 and word_count > 60:
        signals.append(_sig(
            "no-attribution", "No sourcing language detected",
            "Longer article without attribution terms such as \"according to\", "
            "\"officials said\" or \"a study found\".",
            "medium",
        ))
    if objectivity_hits >= 3:
        signals.append(_sig(
            "sourcing-present", "Sourcing language present",
            f"The text references sources or evidence {objectivity_hits} times, "
            "which is typical of factual reporting.",
            "positive",
        ))

    # 6. Sentiment neutrality
    sentiment = analyze_sentiment(full)
    if abs(sentiment["score"]) < 0.15 and word_count > 40:
        signals.append(_sig(
            "neutral-tone", "Neutral tone",
            "The emotional tone of the text is largely neutral, consistent with "
            "straight news reporting.",
            "positive",
        ))

    # 7. Source URL provided
    if source_url:
        signals.append(_sig(
            "source-provided", "Source URL provided",
            "A source link was supplied, allowing readers to verify the origin "
            "of the content.",
            "positive",
        ))

    # 8. Groq verdict (LLM-derived flags + explanation)
    if groq_flags:
        for i, flag in enumerate(groq_flags[:5]):
            if isinstance(flag, dict):
                title = str(flag.get("title") or f"flag-{i+1}")[:120]
                desc = str(flag.get("description") or groq_explanation or title)[:500]
                sev = str(flag.get("severity", "medium")).lower()
            else:
                title, desc, sev = str(flag)[:120], groq_explanation or str(flag), "medium"
            if sev not in ("high", "medium", "low", "positive", "info"):
                sev = "medium"
            signals.append(_sig(
                f"groq-{i+1}", f"Groq: {title}", desc, sev))
    elif groq_explanation:
        signals.append(_sig(
            "groq-verdict", "Groq assessment",
            groq_explanation[:500], "info"))

    # 9. Prediction-aware framing
    if prediction == "misinformative" and confidence < 0.7:
        signals.append(_sig(
            "low-confidence", "Low-confidence prediction",
            "The classifier's confidence is close to the decision boundary — "
            "treat this result with caution.",
            "info",
        ))

    signals.sort(key=lambda s: _SEVERITY_ORDER.get(s["severity"], 5))
    return signals[:8]
# ---------------------------------------------------------------------------
# REVIEW signals
# ---------------------------------------------------------------------------

def review_signals(
    review_text: str,
    prediction: str,
    confidence: float,
    stats: dict,
    rating: Optional[int] = None,
    verified_purchase: Optional[bool] = None,
    product_name: Optional[str] = None,
    groq_flags: Optional[list] = None,
    groq_explanation: str = "",
    groq_indicators: Optional[list] = None,
) -> list[dict]:
    """Build explainable signals for a review analysis from real text features."""
    text = review_text or ""
    lower = text.lower()
    words = re.findall(r"[A-Za-z']+", lower)
    word_count = stats["word_count"]
    signals: list[dict] = []

    # 1. Promotional / marketing language
    promo_hits = [p for p in PROMO_PHRASES if p in lower]
    if len(promo_hits) >= 2:
        signals.append(_sig(
            "promotional-language", "Excessive promotional language",
            f"Marketing-style phrases found ({', '.join(promo_hits[:4])}) — "
            "typical of advertorial or incentivised reviews.",
            "high",
        ))
    elif len(promo_hits) == 1:
        signals.append(_sig(
            "mild-promotional-language", "Promotional wording",
            f"One marketing-style phrase found (\"{promo_hits[0]}\").",
            "low",
        ))

    # 2. Generic praise without specifics
    generic_hits = sum(1 for w in words if w in GENERIC_PRAISE)
    specificity_hits = sum(1 for w in words if w in SPECIFICITY_MARKERS)
    has_digits = bool(re.search(r"\d", text))
    if generic_hits >= 3 and specificity_hits == 0 and not has_digits:
        signals.append(_sig(
            "generic-praise", "Generic claims without specifics",
            f"{generic_hits} generic praise words but no concrete details "
            "(no timespans, features, numbers or product-specific terms).",
            "medium" if prediction == "suspicious" else "low",
        ))

    # 3. Personal experience markers
    experience_words = {"i", "my", "me", "we", "our", "bought", "purchased", "used",
                        "using", "tried", "ordered", "arrived", "returned", "own"}
    experience_hits = sum(1 for w in words if w in experience_words)
    if experience_hits == 0 and word_count >= 15:
        signals.append(_sig(
            "no-experience", "Lacks personal experience details",
            "No first-person usage or purchase context detected — genuine "
            "reviews usually describe the buyer's experience.",
            "medium",
        ))
    elif experience_hits >= 3:
        signals.append(_sig(
            "experience-present", "Contains personal experience details",
            f"{experience_hits} first-person / purchase-experience references "
            "suggest hands-on usage.",
            "positive",
        ))

    # 4. Specific details present
    if specificity_hits >= 2 or (specificity_hits >= 1 and has_digits):
        markers = sorted({w for w in words if w in SPECIFICITY_MARKERS})
        signals.append(_sig(
            "specific-details", "Contains specific experience details",
            f"Concrete references detected ({', '.join(markers[:5])})"
            + (", including numbers" if has_digits else "") + ".",
            "positive",
        ))

    # 5. Repetitive phrasing
    repeated = _repeated_ngrams(text, n=1, min_repeats=3) or _repeated_ngrams(text, n=2, min_repeats=3)
    if repeated:
        signals.append(_sig(
            "repetitive-phrasing", "Repetitive phrasing",
            f"The phrase \"{repeated}\" is repeated several times — unnatural "
            "emphasis sometimes seen in fabricated reviews.",
            "medium",
        ))

    # 6. Punctuation / capitalisation
    sentence_count = max(1, stats["sentence_count"])
    excl_density = stats["exclamation_count"] / sentence_count
    if stats["exclamation_count"] >= 3 and excl_density > 0.5:
        signals.append(_sig(
            "exclamation-overload", "Excessive exclamation marks",
            f"{stats['exclamation_count']} exclamation marks across "
            f"{stats['sentence_count']} sentences — emotionally inflated style.",
            "high" if stats["exclamation_count"] >= 6 else "medium",
        ))
    if stats["caps_word_count"] >= 2:
        caps = CAPS_WORD_RE.findall(text)
        signals.append(_sig(
            "shouting-caps", "Capitalised emphasis",
            f"Words written in ALL CAPS ({', '.join(caps[:4])}) to force emphasis.",
            "medium",
        ))

    # 7. Rating / sentiment agreement
    sentiment = analyze_sentiment(text)
    if rating is not None:
        if rating >= 4 and sentiment["label"] == "negative":
            signals.append(_sig(
                "rating-sentiment-mismatch", "Rating contradicts sentiment",
                f"A {rating}-star rating paired with predominantly negative "
                "language is inconsistent.",
                "high",
            ))
        elif rating <= 2 and sentiment["label"] == "positive":
            signals.append(_sig(
                "rating-sentiment-mismatch", "Rating contradicts sentiment",
                f"A {rating}-star rating paired with predominantly positive "
                "language is inconsistent.",
                "high",
            ))
        elif rating >= 4 and word_count < 8 and generic_hits >= 1:
            signals.append(_sig(
                "short-glowing-review", "Very short 5-star style review",
                "A very short, purely positive review carries little verifiable "
                "information about the product.",
                "medium",
            ))

    # 8. Unnaturally enthusiastic tone
    if sentiment["score"] > 0.7 and promo_hits:
        signals.append(_sig(
            "unnatural-sentiment", "Unnaturally enthusiastic tone",
            f"Sentiment score {sentiment['score']:+.2f} combined with promotional "
            "phrasing reads like marketing copy rather than an experience report.",
            "medium",
        ))

    # 9. Verified purchase context
    if verified_purchase is True:
        signals.append(_sig(
            "verified-purchase", "Verified purchase",
            "The reviewer is flagged as a verified buyer, which slightly "
            "increases trustworthiness.",
            "positive",
        ))
    elif verified_purchase is False and prediction == "suspicious":
        signals.append(_sig(
            "unverified-purchase", "Not a verified purchase",
            "The review is not marked as a verified purchase.",
            "low",
        ))

    # 10. Product name echo (excessive brand repetition)
    if product_name:
        tokens = re.findall(r"[A-Za-z]{3,}", product_name.lower())
        if tokens:
            brand_hits = sum(1 for w in words if w == tokens[0])
            if brand_hits >= 3:
                signals.append(_sig(
                    "brand-echo", "Excessive brand repetition",
                    f"The product/brand term \"{tokens[0]}\" appears "
                    f"{brand_hits} times in a short review.",
                    "medium",
                ))

    # 11. Groq verdict (LLM-derived flags, indicators, explanation)
    if groq_flags:
        for i, flag in enumerate(groq_flags[:5]):
            if isinstance(flag, dict):
                title = str(flag.get("title") or f"flag-{i+1}")[:120]
                desc = str(flag.get("description") or groq_explanation or title)[:500]
                sev = str(flag.get("severity", "medium")).lower()
            else:
                title, desc, sev = str(flag)[:120], groq_explanation or str(flag), "medium"
            if sev not in ("high", "medium", "low", "positive", "info"):
                sev = "medium"
            signals.append(_sig(
                f"groq-{i+1}", f"Groq: {title}", desc, sev))
    elif groq_explanation:
        signals.append(_sig(
            "groq-verdict", "Groq assessment",
            groq_explanation[:500], "info"))
    if groq_indicators:
        shown = ", ".join(str(x)[:80] for x in groq_indicators[:4])
        if shown:
            signals.append(_sig(
                "authenticity-indicators", "Authenticity indicators",
                f"Groq notes: {shown}.", "info"))

    # 12. Low-confidence framing
    if confidence < 0.7:
        signals.append(_sig(
            "low-confidence", "Low-confidence prediction",
            "The classifier's confidence is close to the decision boundary — "
            "treat this result with caution.",
            "info",
        ))

    signals.sort(key=lambda s: _SEVERITY_ORDER.get(s["severity"], 5))
    return signals[:8]





# ---------------------------------------------------------------------------
# GENERAL content signals (social posts / blogs / product descriptions)
# ---------------------------------------------------------------------------
def general_signals(
    content: str,
    prediction: str,
    confidence: float,
    stats: dict,
    groq_flags=None,
    groq_explanation: str = "",
) -> list[dict]:
    """Combine local text features with the Groq verdict."""
    text = content or ""
    lower = text.lower()
    words = re.findall(r"[A-Za-z']+", lower)
    signals: list[dict] = []
    sens = sorted({w for w in words if w in SENSATIONAL_WORDS})
    if len(sens) >= 3:
        signals.append(_sig(
            "sensational-language", "Sensational language",
            f"Charged terms ({', '.join(sens[:6])}) suggest emotive framing.", "high"))
    if stats.get("exclamation_count", 0) >= 3:
        signals.append(_sig(
            "excessive-punctuation", "Excessive punctuation",
            "Multiple exclamation marks are uncommon in neutral copy.", "medium"))
    if stats.get("all_caps_ratio", 0) > 0.08 and stats.get("caps_word_count", 0) >= 3:
        signals.append(_sig(
            "heavy-capitalisation", "Heavy capitalisation",
            "ALL-CAPS emphasis is a common manipulation pattern.", "medium"))
    strong = sorted({w for w in words if w in STRONG_CLAIM_WORDS})
    if len(strong) >= 2:
        signals.append(_sig(
            "strong-claims", "Absolute claims",
            f"Absolutes ({', '.join(strong[:4])}) merit verification.", "medium"))
    obj = sorted({w for w in words if w in OBJECTIVITY_MARKERS})
    if len(obj) >= 2:
        signals.append(_sig(
            "sourcing-language", "Sourcing language present",
            "References to data/sources slightly increase credibility.", "positive"))
    if groq_flags:
        for i, flag in enumerate(groq_flags[:5]):
            if isinstance(flag, dict):
                title = str(flag.get("title") or f"flag-{i+1}")[:120]
                desc = str(flag.get("description") or groq_explanation or title)[:500]
                sev = str(flag.get("severity", "medium")).lower()
            else:
                title, desc, sev = str(flag)[:120], groq_explanation or str(flag), "medium"
            if sev not in ("high", "medium", "low", "positive", "info"):
                sev = "medium"
            signals.append(_sig(f"groq-{i+1}", f"Groq: {title}", desc, sev))
    elif groq_explanation:
        signals.append(_sig("groq-verdict", "Groq assessment",
                            groq_explanation[:500], "info"))
    if confidence < 0.7:
        signals.append(_sig("low-confidence", "Low-confidence prediction",
                            "Close to the decision boundary - treat with caution.", "info"))
    signals.sort(key=lambda s: _SEVERITY_ORDER.get(s["severity"], 5))
    return signals[:8]


