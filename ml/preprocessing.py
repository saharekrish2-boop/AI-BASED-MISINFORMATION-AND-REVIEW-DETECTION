"""Convenience wrapper - canonical implementation: backend/ml/preprocessing.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ml.preprocessing import build_vectorizer, normalize_text  # noqa: E402,F401
