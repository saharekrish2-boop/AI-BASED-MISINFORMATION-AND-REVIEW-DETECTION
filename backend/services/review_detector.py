"""Review authenticity detection service (Groq only)."""
from __future__ import annotations

from typing import Optional

from . import explainability as ex
from . import groq as om


def analyze_review(
    review_text: str,
    product_name: Optional[str] = None,
    rating: Optional[int] = None,
    verified_purchase: Optional[bool] = None,
) -> dict:
    """Run Groq review analysis; keep local text stats as context."""
    text = review_text.strip()
    stats = ex.text_statistics(text)
    res = om.analyze_review(text, product_name, rating, verified_purchase)
    signals = ex.review_signals(
        review_text=text, prediction=res["prediction"], confidence=res["confidence"],
        stats=stats, rating=rating, verified_purchase=verified_purchase,
        product_name=product_name,
        groq_flags=res.get("flags", []),
        groq_explanation=res.get("explanation", ""),
        groq_indicators=res.get("authenticity_indicators", []),
    )
    return {
        "prediction": res["prediction"],
        "confidence": res["confidence"],
        "credibility_score": res["credibility_score"],
        "bias_level": res["bias_level"],
        "explanation": res["explanation"],
        "authenticity_indicators": res["authenticity_indicators"],
        "model": res["model"],
        "processing_time_ms": res["processing_time_ms"],
        "signals": signals,
        "text_stats": stats,
        "word_count": stats["word_count"],
        "sentiment": res["sentiment"],
    }

