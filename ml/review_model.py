"""Convenience wrapper - canonical implementation: backend/ml/review_model.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.review_model import MODEL_NAME, ReviewModel, build_pipeline  # noqa: E402,F401
