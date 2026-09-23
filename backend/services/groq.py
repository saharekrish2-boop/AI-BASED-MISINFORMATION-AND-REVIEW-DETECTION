"""Groq analysis engine - the ONLY model backend for TruthLens AI.

POST {GROQ_BASE_URL}/chat/completions with Bearer GROQ_API_KEY.
No local TF-IDF, scikit-learn, or .joblib artifacts are used.
"""
from __future__ import annotations

import json
import logging
import re
import time

import requests as _requests

from .. import config

logger = logging.getLogger("truthlens.groq")

MODEL_NAME = f"Groq/{config.GROQ_MODEL or 'unconfigured'}"

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


class GroqError(RuntimeError):
    """Raised when Groq cannot produce a result."""


class GroqNotConfigured(RuntimeError):
    """Raised when GROQ_API_KEY is missing."""


def is_configured() -> bool:
    return bool(config.GROQ_API_KEY)


def _require_configured() -> None:
    if not config.GROQ_API_KEY:
        raise GroqNotConfigured(
            "GROQ_API_KEY is not set. Set it in the environment "
            "(or backend/.env) to enable analysis."
        )


def status() -> dict:
    return {
        "configured": is_configured(),
        "base_url": config.GROQ_BASE_URL,
        "model": config.GROQ_MODEL,
        "name": MODEL_NAME,
    }


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return {}
    m = _JSON_BLOCK_RE.search(text)
    if m:
        text = m.group(1).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(text[start:end + 1])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def chat_complete_json(system: str, user: str) -> tuple[dict, int]:
    _require_configured()
    # GROQ_BASE_URL already ends with /v1 -> only append /chat/completions
    url = f"{config.GROQ_BASE_URL}/chat/completions"
    payload = {
        "model": config.GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
        "max_tokens": config.GROQ_MAX_TOKENS,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {config.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    started = time.perf_counter()
    try:
        session = _requests.Session()
        session.trust_env = False
        try:
            resp = session.post(url, json=payload, headers=headers,
                                timeout=config.GROQ_TIMEOUT_SECONDS)
        finally:
            session.close()
    except Exception as exc:
        raise GroqError(f"Could not reach Groq: {exc}") from exc
    elapsed_ms = max(1, int((time.perf_counter() - started) * 1000))
    if resp.status_code == 401:
        raise GroqError("Groq rejected the API key (HTTP 401).")
    if resp.status_code == 429:
        raise GroqError("Groq rate limit exceeded (HTTP 429).")
    if resp.status_code >= 400:
        raise GroqError(f"Groq HTTP {resp.status_code}: {resp.text[:300]}")
    try:
        body = resp.json()
    except Exception as exc:
        raise GroqError(f"Groq non-JSON reply: {exc}") from exc
    try:
        content = body["choices"][0]["message"]["content"]
    except Exception:
        raise GroqError(f"Unexpected Groq shape: {str(body)[:300]}")
    if isinstance(content, list):
        content = "".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    parsed = _extract_json(str(content))
    if not parsed:
        raise GroqError("Groq returned an unparsable response.")
    return parsed, elapsed_ms


def _clamp01(value, default: float = 0.5) -> float:
    try:
        v = float(value)
    except Exception:
        return default
    return max(0.0, min(1.0, v))


def _norm_bias(v) -> str:
    s = str(v or "medium").lower()
    return s if s in {"low", "medium", "high"} else "medium"


def _norm_sent(v) -> str:
    s = str(v or "neutral").lower()
    return s if s in {"positive", "neutral", "negative"} else "neutral"


NEWS_SYSTEM = (
    "You are a misinformation-detection assistant. Analyse the news headline "
    "and article text for misinformation, bias, or manipulation patterns. "
    "Return ONLY JSON: prediction ('real'|'misinformative'), confidence (0-1), "
    "credibility_score (0-1), bias_level ('low'|'medium'|'high'), "
    "sentiment ('positive'|'neutral'|'negative'), explanation (1-2 sentences), "
    "flags (array of {title, description, severity high|medium|low|info})."
)

REVIEW_SYSTEM = (
    "You are a fake-review detector. Analyse the review for spammy, "
    "bot-generated, or sentiment-manipulated patterns. Return ONLY JSON: "
    "prediction ('genuine'|'suspicious'), confidence (0-1), "
    "credibility_score (0-1), bias_level ('low'|'medium'|'high'), "
    "sentiment ('positive'|'neutral'|'negative'), explanation (1-2 sentences), "
    "flags (array of {title, description, severity}), "
    "authenticity_indicators (array of short strings)."
)

GENERAL_SYSTEM = (
    "You are a content-credibility assistant. Evaluate the post/blog/description "
    "for credibility, tone, misinformation signals. Return ONLY JSON: "
    "prediction ('credible'|'questionable'|'misleading'), confidence (0-1), "
    "credibility_score (0-1), bias_level ('low'|'medium'|'high'), "
    "sentiment ('positive'|'neutral'|'negative'), explanation (1-2 sentences), "
    "flags (array of {title, description, severity})."
)


def analyze_news(headline: str, content: str) -> dict:
    user = f"Headline: {headline or '(none)'}\n\nArticle:\n{content}"
    parsed, ms = chat_complete_json(NEWS_SYSTEM, user)
    pred = str(parsed.get("prediction", "")).lower().strip()
    if pred not in {"real", "misinformative"}:
        pred = "misinformative" if _clamp01(parsed.get("credibility_score")) < 0.5 else "real"
    return {
        "prediction": pred,
        "confidence": round(_clamp01(parsed.get("confidence")), 4),
        "credibility_score": round(_clamp01(parsed.get("credibility_score")), 4),
        "bias_level": _norm_bias(parsed.get("bias_level")),
        "sentiment": _norm_sent(parsed.get("sentiment")),
        "explanation": str(parsed.get("explanation", ""))[:500],
        "flags": parsed.get("flags") if isinstance(parsed.get("flags"), list) else [],
        "model": MODEL_NAME, "processing_time_ms": ms,
    }


def analyze_review(review_text: str, product_name=None,
                   rating=None, verified_purchase=None) -> dict:
    ctx = (f"Product: {product_name or '(unknown)'} | Rating: {rating} | "
           f"Verified: {verified_purchase}")
    parsed, ms = chat_complete_json(REVIEW_SYSTEM, f"{ctx}\n\nReview:\n{review_text}")
    pred = str(parsed.get("prediction", "")).lower().strip()
    if pred not in {"genuine", "suspicious"}:
        pred = "suspicious" if _clamp01(parsed.get("credibility_score")) < 0.5 else "genuine"
    ind = parsed.get("authenticity_indicators")
    if not isinstance(ind, list):
        ind = []
    return {
        "prediction": pred,
        "confidence": round(_clamp01(parsed.get("confidence")), 4),
        "credibility_score": round(_clamp01(parsed.get("credibility_score")), 4),
        "bias_level": _norm_bias(parsed.get("bias_level")),
        "sentiment": _norm_sent(parsed.get("sentiment")),
        "explanation": str(parsed.get("explanation", ""))[:500],
        "flags": parsed.get("flags") if isinstance(parsed.get("flags"), list) else [],
        "authenticity_indicators": [str(x)[:160] for x in ind][:8],
        "model": MODEL_NAME, "processing_time_ms": ms,
    }


def analyze_general(content: str, content_type: str = "post") -> dict:
    parsed, ms = chat_complete_json(
        GENERAL_SYSTEM, f"Content type: {content_type}\n\nContent:\n{content}")
    pred = str(parsed.get("prediction", "")).lower().strip()
    if pred not in {"credible", "questionable", "misleading"}:
        s = _clamp01(parsed.get("credibility_score"))
        pred = "credible" if s >= 0.66 else ("questionable" if s >= 0.4 else "misleading")
    return {
        "prediction": pred,
        "confidence": round(_clamp01(parsed.get("confidence")), 4),
        "credibility_score": round(_clamp01(parsed.get("credibility_score")), 4),
        "bias_level": _norm_bias(parsed.get("bias_level")),
        "sentiment": _norm_sent(parsed.get("sentiment")),
        "explanation": str(parsed.get("explanation", ""))[:500],
        "flags": parsed.get("flags") if isinstance(parsed.get("flags"), list) else [],
        "model": MODEL_NAME, "processing_time_ms": ms,
    }