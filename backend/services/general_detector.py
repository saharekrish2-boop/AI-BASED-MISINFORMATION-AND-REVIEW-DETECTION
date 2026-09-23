"""General content analysis service (Groq only).

Handles social media posts, blogs, product descriptions.
"""
from __future__ import annotations

from . import explainability as ex
from . import groq as om


def analyze_general(content: str, content_type: str = "post") -> dict:
    stats = ex.text_statistics(content)
    res = om.analyze_general(content, content_type)
    signals = ex.general_signals(
        content=content, prediction=res["prediction"],
        confidence=res["confidence"], stats=stats,
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
