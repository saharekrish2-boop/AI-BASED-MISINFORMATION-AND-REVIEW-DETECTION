"""TruthLens AI - application configuration.

All values can be overridden through environment variables so the same
codebase works for local development and deployment without paid APIs.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent          # .../backend
PROJECT_ROOT = BASE_DIR.parent                      # repository root


def _env_bool(name: str, default: bool = False) -> bool:
    """Parse a boolean environment variable (1/true/yes/on)."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


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

# ---------------------------------------------------------------------------
# CORS - only trusted frontend origins may call the API
# ---------------------------------------------------------------------------
# Whitelist (NOT "*"): the Vite dev server and the production frontend.
# Add extra origins (e.g. a LAN address or a preview build) with the
# comma-separated TRUTHLENS_CORS_ORIGINS environment variable.
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",   # Vite dev server (development)
    "http://127.0.0.1:5173",   # same dev server reached via IP
    "https://truthlens.ai",    # production frontend
]

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("TRUTHLENS_CORS_ORIGINS", ",".join(DEFAULT_CORS_ORIGINS)).split(",")
    if o.strip()
]
CORS_ALLOW_HEADERS = ["Content-Type", "Accept", "Authorization", "X-API-Key"]
CORS_ALLOW_METHODS = ["GET", "POST", "DELETE", "OPTIONS"]

# Input limits (also enforced by Pydantic schemas)
MAX_HEADLINE_LENGTH = 300
MAX_CONTENT_LENGTH = 20000
MAX_REVIEW_LENGTH = 10000
MIN_NEWS_LENGTH = 20
MIN_REVIEW_LENGTH = 10

# ---------------------------------------------------------------------------
# Server-side URL fetching (SSRF / DoS hardening, see README "Security Notes")
# ---------------------------------------------------------------------------
FETCH_TIMEOUT_SECONDS = float(os.getenv("TRUTHLENS_FETCH_TIMEOUT", "10"))
FETCH_MAX_BYTES = int(os.getenv("TRUTHLENS_FETCH_MAX_BYTES", str(2 * 1024 * 1024)))  # 2 MB
FETCH_MAX_REDIRECTS = int(os.getenv("TRUTHLENS_FETCH_MAX_REDIRECTS", "3"))
FETCH_USER_AGENT = os.getenv("TRUTHLENS_FETCH_USER_AGENT", "TruthLensFetcher/1.0")
FETCH_RATE_LIMIT = int(os.getenv("TRUTHLENS_FETCH_RATE_LIMIT", "10"))          # requests...
FETCH_RATE_WINDOW_SECONDS = float(os.getenv("TRUTHLENS_FETCH_RATE_WINDOW", "60"))  # ...per window

# ---------------------------------------------------------------------------
# Authentication for sensitive endpoints (see README "Security Notes")
# ---------------------------------------------------------------------------
# Shared API key expected in the `X-API-Key` header (or `Authorization: Bearer`).
# NEVER hardcode a key here - always provide it through the environment.
# Generate one with:  python -c "import secrets; print(secrets.token_urlsafe(32))"
API_KEY = os.getenv("TRUTHLENS_API_KEY", "").strip()
API_KEY_HEADER = "X-API-Key"
AUTH_SCHEME = "Bearer"
API_KEY_MIN_LENGTH = 16          # shorter keys trigger a startup warning
# Opt-in: also require the API key for the outbound article fetcher.
PROTECT_FETCH_URL = _env_bool("TRUTHLENS_PROTECT_FETCH_URL", False)

APP_NAME = "TruthLens AI"
VERSION = "1.0.0"

NEWS_MODEL_PATH = MODELS_DIR / "news_model.joblib"
REVIEW_MODEL_PATH = MODELS_DIR / "review_model.joblib"
NEWS_METRICS_PATH = MODELS_DIR / "news_metrics.json"
REVIEW_METRICS_PATH = MODELS_DIR / "review_metrics.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)
