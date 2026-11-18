"""News misinformation detection service (Groq only)."""
from __future__ import annotations

import re

from .. import config
from . import explainability as ex
from . import groq as om

_WORD_RE = re.compile(r"[A-Za-z']+")
_MAX_ANALYSIS_CHARS = 6000


def _trim_for_model(content: str, limit: int = _MAX_ANALYSIS_CHARS) -> str:
    """Keep long articles inside the model's per-request token budget."""
    if len(content) <= limit:
        return content
    cut = content[:limit]
    boundary = max(cut.rfind(". "), cut.rfind(".\n"), cut.rfind("! "), cut.rfind("? "))
    if boundary > limit * 0.6:
        cut = cut[:boundary + 1]
    return cut.rstrip()


def _insufficient_input(stats: dict, body_words: int, source_url: str | None) -> dict:
    """Refuse to guess a verdict from a headline/byline-only paste."""
    signals = [{
        "id": "insufficient-input",
        "title": "Not enough article text to analyse",
        "description": (
            f"Only {body_words} words of article body were provided, below the "
            f"{config.MIN_ARTICLE_WORDS}-word minimum. This looks like just a "
            "headline or byline, so no verdict was issued rather than risk a "
            "confident-but-wrong guess. Paste the full article body, or provide "
            "a public source URL."
        ),
        "severity": "info",
    }]
    if source_url:
        signals.append({
            "id": "source-provided",
            "title": "Source URL provided",
            "description": "A source link was supplied for verification.",
            "severity": "positive",
        })
    return {
        "prediction": "insufficient_input",
        "confidence": 0.0,
        "credibility_score": None,
        "bias_level": None,
        "explanation": (
            "Not enough article body text to analyse — this appears to be only a "
            "headline or byline. Paste the full article for a grounded verdict."
        ),
        "model": om.MODEL_NAME,
        "processing_time_ms": 0,
        "signals": signals,
        "text_stats": stats,
        "word_count": stats["word_count"],
        "sentiment": "neutral",
    }


def _annotate_evidence(flags: list) -> list:
    """Fold each grounded flag's verbatim quote into its description."""
    for flag in flags:
        if isinstance(flag, dict) and flag.get("evidence"):
            base = str(flag.get("description") or "").strip()
            flag["description"] = f'{base} — evidence: "{flag["evidence"]}"'.strip(" —")
    return flags


def analyze_news(headline: str, content: str, source_url: str | None = None) -> dict:
    """Run Groq news analysis; keep local text stats as context."""
    original_content = content or ""
    body_words = len(_WORD_RE.findall(original_content))
    if body_words < config.MIN_ARTICLE_WORDS:
        text = f"{headline}. {original_content}".strip() if headline else original_content.strip()
        return _insufficient_input(ex.text_statistics(text), body_words, source_url)

    content = _trim_for_model(original_content)
    was_trimmed = len(content) < len(original_content)
    text = f"{headline}. {content}".strip() if headline else content.strip()
    stats = ex.text_statistics(text)

    res = om.analyze_news(headline or "", content)
    flags = _annotate_evidence(res.get("flags", []))

    # A misinformative verdict with no quotable evidence is likely a hallucination
    # (the model dropped its own flags): cap confidence so the UI frames it as a
    # low-confidence, review-first result.
    if (res["prediction"] == "misinformative" and not flags
            and res.get("dropped_ungrounded_flags", 0)):
        res["confidence"] = min(res["confidence"], 0.49)

    signals = ex.news_signals(
        headline=headline, content=content, prediction=res["prediction"],
        confidence=res["confidence"], stats=stats, source_url=source_url,
        groq_flags=flags,
        groq_explanation=res.get("explanation", ""),
    )
    if was_trimmed:
        signals.insert(0, {
            "id": "article-trimmed",
            "title": "Long article trimmed",
            "description": (
                f"Only the first {len(content):,} characters were analysed so the "
                "request fits within the model's token budget."
            ),
            "severity": "info",
        })
    return {
        "prediction": res["prediction"],
        "confidence": res["confidence"],
        "credibility_score": res["credibility_score"],
        "bias_level": res["bias_level"],
        "explanation": res["explanation"],
        "model": res["model"],
        "processing_time_ms": res["processing_time_ms"],
        "signals": signals,
        "text_stats": stats,
        "word_count": stats["word_count"],
        "sentiment": res["sentiment"],
    }
