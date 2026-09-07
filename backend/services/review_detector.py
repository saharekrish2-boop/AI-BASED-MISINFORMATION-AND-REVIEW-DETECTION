"""Review authenticity detection service (real ML inference + explainability)."""
from __future__ import annotations

import time
from typing import Optional

from ..ml.model_loader import get_review_model
from . import explainability as ex


def analyze_review(
    review_text: str,
    product_name: Optional[str] = None,
    rating: Optional[int] = None,
    verified_purchase: Optional[bool] = None,
) -> dict:
    """Run the full review analysis pipeline and return a serialisable result."""
    text = review_text.strip()
    stats = ex.text_statistics(text)

    model = get_review_model()
    started = time.perf_counter()
    prediction, confidence = model.predict(text)
    elapsed_ms = max(1, int((time.perf_counter() - started) * 1000))

    try:
        top_terms = model.top_terms(text, k=5)
    except Exception:  # explainability must never break prediction
        top_terms = []

    signals = ex.review_signals(
        review_text=text,
        prediction=prediction,
        confidence=confidence,
        stats=stats,
        rating=rating,
        verified_purchase=verified_purchase,
        product_name=product_name,
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
