"""News misinformation detection service (Groq only)."""
from __future__ import annotations

from . import explainability as ex
from . import groq as om


def analyze_news(headline: str, content: str, source_url: str | None = None) -> dict:
    """Run Groq news analysis; keep local text stats as context."""
    text = f"{headline}. {content}".strip() if headline else content.strip()
    stats = ex.text_statistics(text)
    res = om.analyze_news(headline or "", content)
    signals = ex.news_signals(
        headline=headline, content=content, prediction=res["prediction"],
        confidence=res["confidence"], stats=stats, source_url=source_url,
        groq_flags=res.get("flags", []),
        groq_explanation=res.get("explanation", ""),
    )
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

