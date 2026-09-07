"""TruthLens AI - application configuration.

All values can be overridden through environment variables so the same
codebase works for local development and deployment without paid APIs.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent          # .../backend
PROJECT_ROOT = BASE_DIR.parent                      # repository root

DATA_DIR = Path(os.getenv("TRUTHLENS_DATA_DIR", str(BASE_DIR / "data")))
DATABASE_URL = os.getenv(
    "TRUTHLENS_DATABASE_URL", f"sqlite:///{(DATA_DIR / 'truthlens.db').as_posix()}"
)

MODELS_DIR = Path(os.getenv("TRUTHLENS_MODELS_DIR", str(BASE_DIR / "ml" / "models")))
ML_DATA_DIR = BASE_DIR / "ml" / "data"

# Optional override paths for real datasets (CSV with `label,text` columns).
# When provided they take priority over the built-in demo datasets.
NEWS_DATA_PATH = os.getenv("TRUTHLENS_NEWS_DATA", "")
REVIEW_DATA_PATH = os.getenv("TRUTHLENS_REVIEWS_DATA", "")

CORS_ORIGINS = [
    o.strip() for o in os.getenv("TRUTHLENS_CORS_ORIGINS", "*").split(",") if o.strip()
]

# Input limits (also enforced by Pydantic schemas)
MAX_HEADLINE_LENGTH = 300
MAX_CONTENT_LENGTH = 20000
MAX_REVIEW_LENGTH = 10000
MIN_NEWS_LENGTH = 20
MIN_REVIEW_LENGTH = 10

APP_NAME = "TruthLens AI"
VERSION = "1.0.0"

NEWS_MODEL_PATH = MODELS_DIR / "news_model.joblib"
REVIEW_MODEL_PATH = MODELS_DIR / "review_model.joblib"
NEWS_METRICS_PATH = MODELS_DIR / "news_metrics.json"
REVIEW_METRICS_PATH = MODELS_DIR / "review_metrics.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)
