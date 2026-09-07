"""Convenience wrapper - canonical implementation: backend/ml/model_loader.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.model_loader import (  # noqa: E402,F401
    ModelUnavailableError,
    ensure_loaded,
    get_news_model,
    get_review_model,
    reload_models,
    status,
)
