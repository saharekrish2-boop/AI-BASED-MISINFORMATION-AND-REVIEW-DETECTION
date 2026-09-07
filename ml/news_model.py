"""Convenience wrapper - canonical implementation: backend/ml/news_model.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.news_model import MODEL_NAME, NewsModel, build_pipeline  # noqa: E402,F401
