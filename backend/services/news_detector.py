"""News misinformation detection service (real ML inference + explainability)."""
from __future__ import annotations

import time

from ..ml.model_loader import get_news_model
from . import explainability as ex


def analyze_news(headline: str, content: str, source_url: str | None = None) -> dict:
    """Run the full news analysis pipeline and return a serialisable result."""
    text = f"{headline}. {content}".strip() if headline else content.strip()
    stats = ex.text_statistics(text)

    model = get_news_model()
    started = time.perf_counter()
    prediction, confidence = model.predict(text)
    elapsed_ms = max(1, int((time.perf_counter() - started) * 1000))

    try:
        top_terms = model.top_terms(text, k=5)
    except Exception:  # explainability must never break prediction
        top_terms = []

    signals = ex.news_signals(
        headline=headline,
        content=content,
        prediction=prediction,
        confidence=confidence,
        stats=stats,
        source_url=source_url,
        top_terms=top_terms,
    )
    sentiment = ex.analyze_sentiment(text)

    return {
        "prediction": prediction,
        "confidence": round(confidence, 4),
        "model": model.MODEL_NAME,
        "processing_time_ms": elapsed_ms,
        "signals": signals,
        "text_stats": stats,
        "word_count": stats["word_count"],
        "sentiment": sentiment["label"],
    }
