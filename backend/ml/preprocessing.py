"""Lightweight text preprocessing used by the ML pipeline.

Uses a small pure-Python implementation (no external downloads required).
"""
from __future__ import annotations

import re

_URL_RE = re.compile(r"https?://\S+|www\.\S+")
_HTML_RE = re.compile(r"<[^>]+>")
_REPEATED_RE = re.compile(r"(.)\1{2,}")
_NON_WORD_RE = re.compile(r"[^a-z0-9'\s]")
_WS_RE = re.compile(r"\s+")

# Explicit token pattern: words of 2+ letters (keeps TF-IDF space compact).
TOKEN_PATTERN = r"(?u)\b[a-zA-Z][a-zA-Z]{1,}\b"


def normalize_text(text: str) -> str:
    """Normalise raw text before vectorisation.

    - lowercases
    - removes URLs and HTML tags
    - collapses runaway repeated letters ("greaaaat" -> "greaat")
    - strips punctuation and collapses whitespace
    """
    text = (text or "").lower()
    text = _URL_RE.sub(" url ", text)
    text = _HTML_RE.sub(" ", text)
    text = _REPEATED_RE.sub(r"\1\1", text)
    text = _NON_WORD_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text).strip()
    return text


def build_vectorizer(max_features: int = 8000, ngram_range: tuple = (1, 2)):
    """Create the TF-IDF vectorizer used across both models."""
    from sklearn.feature_extraction.text import TfidfVectorizer

    return TfidfVectorizer(
        max_features=max_features,
        ngram_range=ngram_range,
        sublinear_tf=True,
        min_df=1,
        token_pattern=TOKEN_PATTERN,
        strip_accents="unicode",
    )
