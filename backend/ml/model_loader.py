"""Thread-safe model artifact loading/caching for the TruthLens API."""
from __future__ import annotations

import threading

from .. import config
from .news_model import NewsModel
from .review_model import ReviewModel


class ModelUnavailableError(RuntimeError):
    """Raised when a required trained model artifact is missing."""


_lock = threading.Lock()
_cache: dict = {"news": None, "reviews": None, "loaded": False}


def _load_one(key: str):
    path = config.NEWS_MODEL_PATH if key == "news" else config.REVIEW_MODEL_PATH
    if not path.exists():
        return None
    cls = NewsModel if key == "news" else ReviewModel
    try:
        return cls.load(path)
    except Exception as exc:  # corrupted artifact
        raise ModelUnavailableError(
            f"The {key} model file exists but could not be loaded: {exc}"
        ) from exc


def ensure_loaded(force: bool = False) -> None:
    """Load model artifacts from disk once (thread-safe)."""
    with _lock:
        if _cache["loaded"] and not force:
            return
        news = _cache["news"]
        reviews = _cache["reviews"]
        if force or news is None:
            news = _load_one("news")
        if force or reviews is None:
            reviews = _load_one("reviews")
        _cache["news"] = news
        _cache["reviews"] = reviews
        _cache["loaded"] = True


def get_news_model() -> NewsModel:
    ensure_loaded()
    if _cache["news"] is None:
        raise ModelUnavailableError(
            "News detection model is not trained yet. Run the training pipeline "
            "(POST /api/models/train or `python ml/train_news.py`)."
        )
    return _cache["news"]


def get_review_model() -> ReviewModel:
    ensure_loaded()
    if _cache["reviews"] is None:
        raise ModelUnavailableError(
            "Review detection model is not trained yet. Run the training pipeline "
            "(POST /api/models/train or `python ml/train_reviews.py`)."
        )
    return _cache["reviews"]


def reload_models() -> None:
    """Drop cached models and reload from disk (after retraining)."""
    with _lock:
        _cache["news"] = None
        _cache["reviews"] = None
        _cache["loaded"] = False
    ensure_loaded(force=True)


def status() -> dict:
    """Return artifact availability without raising."""
    try:
        ensure_loaded()
    except ModelUnavailableError:
        pass
    return {
        "news": _cache["news"] is not None,
        "reviews": _cache["reviews"] is not None,
    }
