"""TruthLens AI - FastAPI application.

Endpoints
---------
GET  /api/health           System + model health
GET  /api/stats            Aggregated statistics (from SQLite)
GET  /api/history          Paginated/filterable analysis history
GET  /api/history/{id}     Single analysis detail
DELETE /api/history/{id}   Delete one record
DELETE /api/history        Clear all records
POST /api/news/analyze     News misinformation analysis
POST /api/news/fetch-url   Fetch + extract a public article URL (SSRF-hardened)
POST /api/reviews/analyze  Review authenticity analysis
GET  /api/analytics        Aggregated analytics for charts
GET  /api/models/info      Metadata + metrics for both models
POST /api/models/train     Retrain models (real sklearn training)
"""
from __future__ import annotations

import ipaddress
import json
import logging
import re as _re
import secrets
import socket
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse

import requests as _requests
from bs4 import BeautifulSoup as _BS

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config, schemas
from .database import check_database, get_db, init_db
from .ml import model_loader
from .ml import train_news, train_reviews
from .models import Analysis
from .services import news_detector, review_detector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("truthlens")

_train_lock = threading.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    _log_auth_configuration()
    try:
        model_loader.ensure_loaded()
    except Exception as exc:  # pragma: no cover
        logger.warning("Model preload failed: %s", exc)
    yield


def _log_auth_configuration() -> None:
    """Log the authentication posture once at startup (never the key itself)."""
    protected = ", ".join(
        f"{method} {pattern.pattern}" for method, pattern in _SENSITIVE_ROUTE_RULES
    )
    if config.API_KEY:
        if len(config.API_KEY) < config.API_KEY_MIN_LENGTH:
            logger.warning(
                "TRUTHLENS_API_KEY is shorter than %d characters - use a longer random key.",
                config.API_KEY_MIN_LENGTH,
            )
        logger.info("API key authentication ENABLED for: %s", protected)
    else:
        logger.warning(
            "TRUTHLENS_API_KEY is not set - %s will return HTTP 503 until it is configured.",
            protected,
        )
    logger.info("CORS allow-list: %s", ", ".join(config.CORS_ORIGINS) or "(none)")


app = FastAPI(title=f"{config.APP_NAME} API", version=config.VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,  # explicit whitelist (never "*")
    allow_credentials=False,
    allow_methods=config.CORS_ALLOW_METHODS,
    allow_headers=config.CORS_ALLOW_HEADERS,
)


# ---------------------------------------------------------------------------
# Authentication for sensitive endpoints (API key)
# ---------------------------------------------------------------------------
# Destructive / expensive routes require a valid API key (TRUTHLENS_API_KEY),
# enforced in two places on purpose:
#   1. `api_key_guard` middleware - a global net tied to the *path*, so any
#      future route added under these paths is protected automatically;
#   2. `require_api_key` dependency - explicit per-route opt-in, visible in the
#      endpoint signatures and resilient to middleware reordering.
_SENSITIVE_ROUTE_RULES: tuple[tuple[str, "_re.Pattern[str]"], ...] = (
    ("DELETE", _re.compile(r"^/api/history/?$")),       # wipe every record
    ("DELETE", _re.compile(r"^/api/history/\d+/?$")),   # delete one record
    ("POST", _re.compile(r"^/api/models/train/?$")),    # CPU-heavy retraining
)
if config.PROTECT_FETCH_URL:  # opt-in via TRUTHLENS_PROTECT_FETCH_URL=true
    _SENSITIVE_ROUTE_RULES += (("POST", _re.compile(r"^/api/news/fetch-url/?$")),)


def _presented_api_key(request: Request) -> str:
    """Read the API key from ``X-API-Key`` or ``Authorization: Bearer <key>``."""
    key = (request.headers.get(config.API_KEY_HEADER) or "").strip()
    if key:
        return key
    authorization = (request.headers.get("Authorization") or "").strip()
    scheme, _, token = authorization.partition(" ")
    if token and scheme.lower() == config.AUTH_SCHEME.lower():
        return token.strip()
    return ""


def api_key_error(request: Request) -> HTTPException | None:
    """Return the error to raise, or ``None`` when the request may proceed."""
    expected = (config.API_KEY or "").strip()  # read at call time (testable)
    if not expected:
        # Fail closed: never expose destructive routes just because the key
        # was not configured.
        return HTTPException(
            status_code=503,
            detail=(
                "API key authentication is not configured on the server. Set "
                "TRUTHLENS_API_KEY (see README > Security Notes) and restart the backend."
            ),
        )
    presented = _presented_api_key(request)
    if not presented or not secrets.compare_digest(presented, expected):
        return HTTPException(
            status_code=401,
            detail=(
                "Invalid or missing API key. Send it in the "
                f"{config.API_KEY_HEADER} header, or as `Authorization: "
                f"{config.AUTH_SCHEME} <key>`."
            ),
            headers={"WWW-Authenticate": f'{config.AUTH_SCHEME} realm="TruthLens API"'},
        )
    return None


def require_api_key(request: Request) -> None:
    """FastAPI dependency enforcing the API key on sensitive endpoints."""
    error = api_key_error(request)
    if error is not None:
        raise error


@app.middleware("http")
async def api_key_guard(request: Request, call_next):
    """Reject unauthenticated calls to sensitive routes before they execute.

    CORS preflight (``OPTIONS``) is deliberately never blocked here: browsers do
    not attach authentication headers to preflight requests and the CORS
    middleware answers them.
    """
    method = request.method.upper()
    if method != "OPTIONS":
        path = request.url.path.rstrip("/") or "/"
        if any(
            method == rule_method and rule_pattern.match(path)
            for rule_method, rule_pattern in _SENSITIVE_ROUTE_RULES
        ):
            error = api_key_error(request)
            if error is not None:
                return JSONResponse(
                    status_code=error.status_code,
                    content={"detail": str(error.detail)},
                    headers=dict(error.headers or {}),
                )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Error handling - friendly messages, no internal stack traces
# ---------------------------------------------------------------------------
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_req: Request, exc: StarletteHTTPException):
    # Preserve headers (e.g. WWW-Authenticate on 401, Retry-After on 429).
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": str(exc.detail)},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_req: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body",))
        msg = err.get("msg", "Invalid value")
        errors.append({"field": loc, "message": msg})
    friendly = errors[0]["message"] if errors else "Invalid request."
    return JSONResponse(status_code=422, content={"detail": friendly, "errors": errors})


@app.exception_handler(model_loader.ModelUnavailableError)
async def model_unavailable_handler(_req: Request, exc: model_loader.ModelUnavailableError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_req: Request, exc: Exception):  # pragma: no cover
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Unexpected server error. Please try again later."},
    )
# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_metrics(key: str) -> dict | None:
    path = config.NEWS_METRICS_PATH if key == "news" else config.REVIEW_METRICS_PATH
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # corrupted metrics file
        logger.warning("Could not read metrics for %s", key)
    return None


def _model_summary(key: str) -> schemas.ModelMetricsSummary:
    m = _read_metrics(key)
    if not m:
        return schemas.ModelMetricsSummary(trained=False)
    return schemas.ModelMetricsSummary(
        trained=True,
        accuracy=m.get("accuracy"),
        demo_data=bool(m.get("demo_data", False)),
        last_trained=m.get("trained_at"),
        algorithm=m.get("algorithm"),
    )


def _serialize(analysis: Analysis) -> schemas.HistoryItem:
    try:
        signals = json.loads(analysis.signals) if analysis.signals else []
    except Exception:
        signals = []
    try:
        text_stats = json.loads(analysis.text_stats) if analysis.text_stats else None
    except Exception:
        text_stats = None
    return schemas.HistoryItem(
        id=analysis.id,
        type=analysis.type,
        headline=analysis.headline,
        input_text=analysis.input_text,
        source_url=analysis.source_url,
        product_name=analysis.product_name,
        rating=analysis.rating,
        verified_purchase=analysis.verified_purchase,
        prediction=analysis.prediction,
        confidence=analysis.confidence,
        sentiment=analysis.sentiment,
        model_name=analysis.model_name,
        processing_time=analysis.processing_time,
        signals=[schemas.Signal(**s) for s in signals if isinstance(s, dict)],
        text_stats=schemas.TextStats(**text_stats) if text_stats else None,
        word_count=analysis.word_count,
        char_count=analysis.char_count,
        created_at=analysis.created_at,
    )


def _persist(db: Session, a_type: str, text: str, result: dict, **extra) -> Analysis:
    row = Analysis(
        type=a_type,
        input_text=text,
        prediction=result["prediction"],
        confidence=result["confidence"],
        sentiment=result.get("sentiment"),
        model_name=result["model"],
        processing_time=result["processing_time_ms"],
        signals=json.dumps(result["signals"]),
        text_stats=json.dumps(result["text_stats"]),
        word_count=result["word_count"],
        char_count=result["text_stats"]["char_count"],
        **extra,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
# ---------------------------------------------------------------------------
# Health / root
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {"app": config.APP_NAME, "version": config.VERSION, "docs": "/docs"}


@app.get("/api/health", response_model=schemas.HealthResponse)
def health(db: Session = Depends(get_db)):
    db_ok = check_database()
    models = model_loader.status()
    engine_ok = models["news"] or models["reviews"]
    status = "ok" if db_ok and engine_ok else "degraded"
    return schemas.HealthResponse(
        status=status,
        version=config.VERSION,
        database=db_ok,
        news_model=models["news"],
        review_model=models["reviews"],
        analysis_engine=engine_ok,
        timestamp=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------
@app.get("/api/stats", response_model=schemas.StatsResponse)
def stats(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Analysis.type, Analysis.prediction, func.count()).group_by(
            Analysis.type, Analysis.prediction
        )
    ).all()
    counts = {f"{t}|{p}": c for t, p, c in rows}
    total = sum(counts.values())

    news_count = sum(v for k, v in counts.items() if k.startswith("news|"))
    review_count = sum(v for k, v in counts.items() if k.startswith("review|"))
    avg_conf = db.execute(func.avg(Analysis.confidence)).scalar()
    misinf = counts.get("news|misinformative", 0)
    fake_rev = counts.get("review|suspicious", 0)

    news_summary = _model_summary("news")
    review_summary = _model_summary("reviews")
    accuracies = [s.accuracy for s in (news_summary, review_summary) if s.accuracy is not None]
    detection_accuracy = round(sum(accuracies) / len(accuracies), 4) if accuracies else None

    return schemas.StatsResponse(
        total_analyses=total,
        news_count=news_count,
        review_count=review_count,
        suspicious_count=misinf + fake_rev,
        misinformative_count=misinf,
        fake_review_count=fake_rev,
        real_count=counts.get("news|real", 0),
        genuine_count=counts.get("review|genuine", 0),
        avg_confidence=round(float(avg_conf), 4) if avg_conf is not None else None,
        detection_accuracy=detection_accuracy,
        news_model=news_summary,
        review_model=review_summary,
    )
# ---------------------------------------------------------------------------
# Analyze endpoints
# ---------------------------------------------------------------------------
@app.post("/api/news/analyze", response_model=schemas.NewsAnalysisResponse)
def analyze_news(payload: schemas.NewsAnalyzeRequest, db: Session = Depends(get_db)):
    result = news_detector.analyze_news(
        headline=payload.headline,
        content=payload.content,
        source_url=payload.source_url,
    )
    full_text = f"{payload.headline}\n{payload.content}".strip()
    row = _persist(db, "news", full_text, result, headline=payload.headline or None,
                   source_url=payload.source_url)
    return schemas.NewsAnalysisResponse(
        id=row.id,
        headline=payload.headline,
        source_url=payload.source_url,
        prediction=result["prediction"],
        confidence=result["confidence"],
        model=result["model"],
        processing_time_ms=result["processing_time_ms"],
        signals=result["signals"],
        text_stats=result["text_stats"],
        timestamp=row.created_at,
        word_count=result["word_count"],
        sentiment=result["sentiment"],
    )


# ---------------------------------------------------------------------------
# URL fetching (server-side to avoid CORS) - SSRF / DoS hardened
# ---------------------------------------------------------------------------
# Every request goes through `safe_fetch_url()`. See README "Security Notes".
_ALLOWED_SCHEMES = ("http", "https")
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})

# Neutral identifier instead of a spoofed browser User-Agent.
_URL_FETCH_HEADERS = {
    "User-Agent": config.FETCH_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Hosts/IP ranges that must never be reachable through this endpoint:
# loopback, private, link-local, CGNAT, multicast/reserved, 6to4 and ULA.
_BLOCKED_NETWORKS = tuple(
    ipaddress.ip_network(net)
    for net in (
        "0.0.0.0/8",          # "this network"
        "10.0.0.0/8",         # private
        "100.64.0.0/10",      # CGNAT (includes 100.100.100.200 metadata)
        "127.0.0.0/8",        # loopback
        "169.254.0.0/16",     # link-local (includes 169.254.169.254 metadata)
        "172.16.0.0/12",      # private
        "192.0.0.0/24",       # IETF protocol assignments
        "192.0.2.0/24",       # TEST-NET-1
        "192.168.0.0/16",     # private
        "198.18.0.0/15",      # benchmarking
        "198.51.100.0/24",    # TEST-NET-2
        "203.0.113.0/24",     # TEST-NET-3
        "224.0.0.0/4",        # multicast
        "240.0.0.0/4",        # reserved / broadcast
        "::/128",             # unspecified
        "::1/128",            # loopback
        "fc00::/7",           # unique local addresses
        "fe80::/10",          # link-local
        "ff00::/8",           # multicast
        "2001:db8::/32",      # documentation
        "2002::/16",          # 6to4 (can encapsulate private IPv4)
    )
)

# Cloud instance-metadata endpoints (AWS/GCP/Azure, Alibaba, AWS IPv6).
_CLOUD_METADATA_IPS = frozenset({"169.254.169.254", "100.100.100.200", "fd00:ec2::254"})

_FETCH_URL_PATH = "/api/news/fetch-url"
_FETCH_CHUNK_SIZE = 64 * 1024


def _is_blocked_ip(ip: str) -> bool:
    """Return True when an IP literal may not be fetched (fail closed)."""
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return True  # unparseable -> never fetch
    mapped = getattr(addr, "ipv4_mapped", None)  # unwrap ::ffff:127.0.0.1
    if mapped is not None:
        addr = mapped
    if str(addr) in _CLOUD_METADATA_IPS:
        return True
    if any(addr in net for net in _BLOCKED_NETWORKS if net.version == addr.version):
        return True
    return bool(
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def _resolve_host_ips(host: str, port: int) -> list[str]:
    """Resolve a hostname to every IP it maps to (IPv4 + IPv6)."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError, OSError):
        return []
    return sorted({str(info[4][0]).split("%")[0] for info in infos})


def _validate_fetch_url(url: str) -> tuple[str, str, int]:
    """Validate scheme/host/port and resolve + check every target IP.

    Returns ``(scheme, host, port)``. Raises HTTPException(400) when the URL is
    malformed, carries credentials, resolves to nothing, or touches a
    non-public address.
    """
    try:
        parsed = urlparse(url or "")
        scheme = (parsed.scheme or "").lower()
        host = (parsed.hostname or "").strip().lower().rstrip(".")
        port = parsed.port
        has_credentials = bool(parsed.username or parsed.password)
    except ValueError as exc:  # malformed port / IPv6 literal
        raise HTTPException(status_code=400, detail="Please enter a valid URL.") from exc

    if scheme not in _ALLOWED_SCHEMES:
        raise HTTPException(status_code=400, detail="Only HTTP and HTTPS URLs are supported.")
    if not host:
        raise HTTPException(status_code=400, detail="Please enter a valid URL.")
    if has_credentials:
        raise HTTPException(
            status_code=400, detail="URLs containing embedded credentials are not supported."
        )

    port = port if port is not None else (443 if scheme == "https" else 80)
    resolved = _resolve_host_ips(host, port)
    if not resolved:
        raise HTTPException(
            status_code=400, detail="That hostname could not be resolved. Please check the URL."
        )
    # Fail closed: a single non-public answer is enough to reject the request.
    if any(_is_blocked_ip(ip) for ip in resolved):
        raise HTTPException(
            status_code=400,
            detail=(
                "This URL resolves to a non-public network address (localhost, private or "
                "link-local), which is blocked for security reasons."
            ),
        )
    return scheme, host, port


class _SlidingWindowRateLimiter:
    """Thread-safe, dependency-free sliding-window limiter (per client key)."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(0.1, float(window_seconds))
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, float]:
        """Register a hit. Returns ``(allowed, retry_after_seconds)``."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and (now - hits[0]) >= self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return False, max(0.0, self.window_seconds - (now - hits[0]))
            hits.append(now)
            if len(self._hits) > 1024:  # opportunistic cleanup of idle keys
                for stale in [k for k, v in self._hits.items() if not v]:
                    del self._hits[stale]
            return True, 0.0


_fetch_limiter = _SlidingWindowRateLimiter(
    config.FETCH_RATE_LIMIT, config.FETCH_RATE_WINDOW_SECONDS
)


@app.middleware("http")
async def rate_limit_article_fetch(request: Request, call_next):
    """Rate-limit only the article-fetch endpoint (10 requests / 60 s default).

    Implemented without extra dependencies (drop-in equivalent of slowapi).
    Returns 429 + ``Retry-After`` when a client exceeds its budget; every other
    route is passed through untouched.
    """
    if request.method == "POST" and request.url.path.rstrip("/") == _FETCH_URL_PATH:
        client = request.client.host if request.client else "unknown"
        allowed, retry_after = _fetch_limiter.check(client)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        "Too many article fetch requests. Please wait "
                        f"{int(retry_after) + 1} second(s) before trying again."
                    )
                },
                headers={"Retry-After": str(int(retry_after) + 1)},
            )
    return await call_next(request)


def _too_large(max_bytes: int) -> HTTPException:
    """Build the 413 raised when a download exceeds the configured cap."""
    return HTTPException(
        status_code=413,
        detail=(
            f"The article is larger than the {max_bytes // (1024 * 1024)} MB download limit, "
            "so it was not fetched."
        ),
    )


def safe_fetch_url(url: str, *, max_redirects: int | None = None) -> tuple[str, str]:
    """Fetch a public HTML page with SSRF and resource limits.

    Guarantees:
      * only ``http``/``https`` targeting a **public** IP - the host is resolved
        and checked on every hop (loopback, private, link-local, CGNAT,
        multicast/reserved, cloud-metadata addresses are rejected),
      * no credentials in the URL; ambient proxy env vars are ignored,
      * redirects are **not** auto-followed: each ``Location`` is re-validated
        and the chain is capped by ``FETCH_MAX_REDIRECTS``,
      * the body is streamed and capped at ``FETCH_MAX_BYTES`` (413 when bigger),
      * ``FETCH_TIMEOUT_SECONDS`` timeout and a neutral ``TruthLensFetcher`` UA.

    Returns ``(final_url, html_text)``.

    Residual risk: DNS is resolved once for validation and again by the HTTP
    client, so a hostile resolver could rebind between the two lookups. Run
    behind an egress-restricted proxy where that matters.
    """
    hops = config.FETCH_MAX_REDIRECTS if max_redirects is None else max(0, int(max_redirects))
    max_bytes = config.FETCH_MAX_BYTES
    current = (url or "").strip()
    session = _requests.Session()
    session.trust_env = False  # ignore HTTP(S)_PROXY env vars
    try:
        for attempt in range(hops + 1):
            _validate_fetch_url(current)  # re-validated on every hop
            try:
                resp = session.get(
                    current,
                    headers=_URL_FETCH_HEADERS,
                    timeout=config.FETCH_TIMEOUT_SECONDS,
                    allow_redirects=False,
                    stream=True,
                )
            except _requests.exceptions.Timeout:
                raise HTTPException(
                    status_code=504,
                    detail="The request timed out while fetching the article. "
                    "The site may be slow or unavailable.",
                )
            except _requests.exceptions.ConnectionError:
                raise HTTPException(
                    status_code=502,
                    detail="Could not connect to the URL. Please check the address and try again.",
                )
            except _requests.exceptions.RequestException as exc:
                raise HTTPException(status_code=502, detail=f"Failed to fetch the URL: {exc}")

            try:
                if resp.status_code in _REDIRECT_STATUSES:
                    location = (resp.headers.get("Location") or "").strip()
                    if not location:
                        raise HTTPException(
                            status_code=502,
                            detail="The URL returned a redirect without a destination.",
                        )
                    if attempt >= hops:
                        raise HTTPException(
                            status_code=400,
                            detail=f"The URL redirected more than {hops} time(s); it was not followed.",
                        )
                    current = urljoin(current, location)  # checked at the top of the loop
                    continue

                if resp.status_code >= 400:
                    raise HTTPException(
                        status_code=502,
                        detail=(
                            f"The URL returned HTTP {resp.status_code}. "
                            "The article may be unavailable."
                        ),
                    )

                content_type = resp.headers.get("Content-Type", "")
                if "text/html" not in content_type and "application/xhtml" not in content_type:
                    raise HTTPException(
                        status_code=400, detail="The URL does not point to an HTML article page."
                    )

                declared = resp.headers.get("Content-Length", "")
                if declared.isdigit() and int(declared) > max_bytes:
                    raise _too_large(max_bytes)

                chunks: list[bytes] = []
                total = 0
                for chunk in resp.iter_content(chunk_size=_FETCH_CHUNK_SIZE):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > max_bytes:
                        raise _too_large(max_bytes)
                    chunks.append(chunk)
                body = b"".join(chunks)
            finally:
                resp.close()

            return current, body.decode(resp.encoding or "utf-8", errors="replace")
    finally:
        session.close()

    # Unreachable: the loop always returns, continues, or raises.
    raise HTTPException(status_code=400, detail="The URL could not be fetched.")


def _extract_article_html(html: str) -> dict:
    """Extract headline and main text from raw HTML using BeautifulSoup."""
    soup = _BS(html, "lxml")

    headline = ""

    # Try <title> tag first
    if soup.title and soup.title.string:
        headline = soup.title.string.strip()

    # Try common article title selectors (more specific than <title>)
    for selector in [
        "h1.article-title",
        "h1.post-title",
        "h1.entry-title",
        "h1.headline",
        '[data-testid="headline"]',
        "h1[class*=title]",
        "h1[class*=headline]",
        "article h1",
        "header h1",
    ]:
        el = soup.select_one(selector)
        if el and el.get_text(strip=True):
            headline = el.get_text(strip=True)
            break

    # Fallback to meta og:title or twitter:title
    if not headline:
        for prop in ["og:title", "twitter:title"]:
            tag = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
            if tag and tag.get("content"):
                headline = tag["content"].strip()
                break

    # Remove script, style, nav, footer, header, aside elements for cleaner text extraction
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript", "iframe"]):
        tag.decompose()

    content = ""

    # Try common article body selectors
    for selector in [
        "article",
        '[class*=article-body]',
        '[class*=article-content]',
        '[class*=story-body]',
        '[class*=post-content]',
        '[class*=entry-content]',
        '[data-testid="article-body"]',
        "main",
    ]:
        container = soup.select_one(selector)
        if container:
            paragraphs = container.find_all("p")
            if paragraphs:
                content = "\n\n".join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 20)
                if len(content) > 100:
                    break

    # Fallback: grab all <p> tags from the page
    if not content or len(content) < 100:
        paragraphs = soup.find_all("p")
        content = "\n\n".join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 20)

    # Clean up whitespace
    content = _re.sub(r"\n{3,}", "\n\n", content).strip()

    return {"headline": headline, "content": content}


# Opt-in protection for the outbound article fetcher
# (TRUTHLENS_PROTECT_FETCH_URL=true). Left public by default so the demo
# "Fetch URL" flow works without a key, but it is still SSRF-hardened and
# rate-limited (see README > Security Notes).
_FETCH_URL_AUTH_DEPENDENCIES = [Depends(require_api_key)] if config.PROTECT_FETCH_URL else []


@app.post("/api/news/fetch-url", dependencies=_FETCH_URL_AUTH_DEPENDENCIES)
def fetch_news_url(payload: schemas.NewsFetchUrlRequest):
    """Fetch a news article URL server-side and extract headline + content.

    Runs on the backend to bypass CORS restrictions that browsers enforce on
    cross-origin requests. The fetch itself is performed by ``safe_fetch_url``,
    which enforces SSRF protections (public-IP-only targets, re-validated
    redirect hops, no credentials, 2 MB body cap, 10 s timeout); this endpoint
    is additionally rate-limited per client IP (429 + Retry-After).
    """
    final_url, html = safe_fetch_url(payload.url)
    extracted = _extract_article_html(html)

    if not extracted["content"] or len(extracted["content"]) < 50:
        raise HTTPException(
            status_code=422,
            detail="Could not extract meaningful article text from this URL. The page may use a format we cannot parse, or require JavaScript to load.",
        )

    return {
        "url": final_url,  # post-redirect URL, so the recorded source is accurate
        "headline": extracted["headline"],
        "content": extracted["content"],
    }


@app.post("/api/reviews/analyze", response_model=schemas.ReviewAnalysisResponse)
def analyze_review(payload: schemas.ReviewAnalyzeRequest, db: Session = Depends(get_db)):
    result = review_detector.analyze_review(
        review_text=payload.review_text,
        product_name=payload.product_name,
        rating=payload.rating,
        verified_purchase=payload.verified_purchase,
    )
    row = _persist(
        db, "review", payload.review_text, result,
        product_name=payload.product_name,
        rating=payload.rating,
        verified_purchase=payload.verified_purchase,
    )
    return schemas.ReviewAnalysisResponse(
        id=row.id,
        product_name=payload.product_name,
        rating=payload.rating,
        verified_purchase=payload.verified_purchase,
        prediction=result["prediction"],
        confidence=result["confidence"],
        model=result["model"],
        processing_time_ms=result["processing_time_ms"],
        signals=result["signals"],
        text_stats=result["text_stats"],
        timestamp=row.created_at,
        word_count=result["word_count"],
        sentiment=result["sentiment"],
    )


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------
@app.get("/api/history", response_model=schemas.HistoryResponse)
def history(
    type: str | None = Query(default=None, pattern="^(news|review)$"),
    prediction: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    sort: str = Query(default="newest", pattern="^(newest|oldest|confidence)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    stmt = select(Analysis)
    if type:
        stmt = stmt.where(Analysis.type == type)
    if prediction and prediction != "all":
        if prediction == "flagged":
            stmt = stmt.where(Analysis.prediction.in_(["misinformative", "suspicious"]))
        else:
            stmt = stmt.where(Analysis.prediction == prediction)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Analysis.input_text.like(like) | Analysis.headline.like(like))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0

    if sort == "newest":
        stmt = stmt.order_by(Analysis.created_at.desc(), Analysis.id.desc())
    elif sort == "oldest":
        stmt = stmt.order_by(Analysis.created_at.asc(), Analysis.id.asc())
    else:
        stmt = stmt.order_by(Analysis.confidence.desc())

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    items = [_serialize(a) for a in db.execute(stmt).scalars().all()]
    return schemas.HistoryResponse(items=items, total=total, page=page, page_size=page_size)


@app.get("/api/history/{analysis_id}", response_model=schemas.HistoryItem)
def history_item(analysis_id: int, db: Session = Depends(get_db)):
    row = db.get(Analysis, analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    return _serialize(row)


@app.delete("/api/history/{analysis_id}")
def delete_history_item(
    analysis_id: int,
    db: Session = Depends(get_db),
    _auth: None = Depends(require_api_key),
):
    row = db.get(Analysis, analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    db.delete(row)
    db.commit()
    return {"deleted": analysis_id}


@app.delete("/api/history")
def clear_history(
    db: Session = Depends(get_db),
    _auth: None = Depends(require_api_key),
):
    count = db.execute(select(func.count()).select_from(Analysis)).scalar() or 0
    db.query(Analysis).delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}
# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
CONF_BUCKETS = [(50, 60), (60, 70), (70, 80), (80, 90), (90, 101)]


@app.get("/api/analytics", response_model=schemas.AnalyticsResponse)
def analytics(db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            Analysis.type, Analysis.prediction, Analysis.confidence,
            Analysis.sentiment, Analysis.created_at,
        )
    ).all()

    total = len(rows)
    news_results = {"real": 0, "misinformative": 0}
    review_results = {"genuine": 0, "suspicious": 0}
    type_counts = {"news": 0, "review": 0}
    sentiment_distribution = {"positive": 0, "neutral": 0, "negative": 0}
    bucket_counts = [0] * len(CONF_BUCKETS)
    flagged = 0

    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)) for i in range(13, -1, -1)]
    daily = {d.isoformat(): {"news": 0, "review": 0, "flagged": 0} for d in days}

    for a_type, prediction, confidence, sentiment, created_at in rows:
        type_counts[a_type] = type_counts.get(a_type, 0) + 1
        if a_type == "news":
            news_results[prediction] = news_results.get(prediction, 0) + 1
        else:
            review_results[prediction] = review_results.get(prediction, 0) + 1
        if prediction in ("misinformative", "suspicious"):
            flagged += 1
        if sentiment in sentiment_distribution:
            sentiment_distribution[sentiment] += 1
        for i, (lo, hi) in enumerate(CONF_BUCKETS):
            if lo <= confidence * 100 < hi:
                bucket_counts[i] += 1
                break
        day_key = created_at.date().isoformat() if created_at else None
        if day_key and day_key in daily:
            daily[day_key][a_type] += 1
            if prediction in ("misinformative", "suspicious"):
                daily[day_key]["flagged"] += 1

    confidence_buckets = [
        {"range": f"{lo}-{hi if hi <= 100 else 100}%", "count": bucket_counts[i]}
        for i, (lo, hi) in enumerate(CONF_BUCKETS)
    ]
    daily_volume = [
        {
            "date": d,
            "short": datetime.fromisoformat(d).strftime("%b %d"),
            "news": v["news"],
            "review": v["review"],
            "total": v["news"] + v["review"],
        }
        for d, v in daily.items()
    ]
    daily_suspicious_rate = [
        {
            "date": d,
            "short": datetime.fromisoformat(d).strftime("%b %d"),
            "rate": round(v["flagged"] / (v["news"] + v["review"]), 4)
            if (v["news"] + v["review"]) > 0 else 0.0,
            "flagged": v["flagged"],
            "total": v["news"] + v["review"],
        }
        for d, v in daily.items()
    ]

    return schemas.AnalyticsResponse(
        has_data=total > 0,
        total=total,
        news_results=news_results,
        review_results=review_results,
        type_counts=type_counts,
        confidence_buckets=confidence_buckets,
        daily_volume=daily_volume,
        sentiment_distribution=sentiment_distribution,
        suspicious_rate=round(flagged / total, 4) if total else 0.0,
        daily_suspicious_rate=daily_suspicious_rate,
    )
# ---------------------------------------------------------------------------
# Model info / training
# ---------------------------------------------------------------------------
@app.get("/api/models/info", response_model=list[schemas.ModelInfoResponse])
def models_info():
    info = []
    for key, name in (("news", "News Detection Model"), ("reviews", "Review Detection Model")):
        metrics = _read_metrics(key)
        artifact = config.NEWS_MODEL_PATH if key == "news" else config.REVIEW_MODEL_PATH
        base = {
            "key": key,
            "name": name,
            "algorithm": "TF-IDF + Logistic Regression",
            "vectorizer": "TF-IDF (word 1-2 grams, sublinear tf)",
            "classifier": "Logistic Regression (balanced class weights)",
            "trained": artifact.exists(),
            "demo_data": bool(metrics.get("demo_data")) if metrics else True,
        }
        if metrics:
            base.update({
                "training_samples": metrics.get("training_samples"),
                "test_samples": metrics.get("test_samples"),
                "accuracy": metrics.get("accuracy"),
                "precision": metrics.get("precision"),
                "recall": metrics.get("recall"),
                "f1": metrics.get("f1"),
                "confusion_matrix": metrics.get("confusion_matrix"),
                "labels": metrics.get("labels"),
                "last_trained": metrics.get("trained_at"),
                "data_source": metrics.get("data_source"),
            })
        info.append(schemas.ModelInfoResponse(**base))
    return info


@app.post("/api/models/train", response_model=schemas.TrainResponse)
def train_models(
    payload: schemas.TrainRequest,
    _auth: None = Depends(require_api_key),
):
    if not _train_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Training is already in progress.")
    started = time.perf_counter()
    news_metrics = None
    reviews_metrics = None
    try:
        try:
            if payload.model in ("all", "news"):
                news_metrics = train_news.train(verbose=False)
        except Exception as exc:
            logger.exception("News training failed")
            raise HTTPException(status_code=500, detail=f"News model training failed: {exc}") from exc
        try:
            if payload.model in ("all", "reviews"):
                reviews_metrics = train_reviews.train(verbose=False)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Review training failed")
            raise HTTPException(status_code=500, detail=f"Review model training failed: {exc}") from exc
        model_loader.reload_models()
        elapsed = int((time.perf_counter() - started) * 1000)
        scope = payload.model if payload.model != "all" else "both models"
        message = f"Training complete for {scope}."
        if news_metrics and news_metrics.get("demo_data"):
            message += " News model trained on DEMO data."
        if reviews_metrics and reviews_metrics.get("demo_data"):
            message += " Review model trained on DEMO data."
        return schemas.TrainResponse(
            success=True, message=message, news=news_metrics,
            reviews=reviews_metrics, elapsed_ms=elapsed,
        )
    finally:
        _train_lock.release()





