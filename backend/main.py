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
POST /api/reviews/analyze  Review authenticity analysis
GET  /api/analytics        Aggregated analytics for charts
GET  /api/models/info      Metadata + metrics for both models
POST /api/models/train     Retrain models (real sklearn training)
"""
from __future__ import annotations

import json
import logging
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

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
    try:
        model_loader.ensure_loaded()
    except Exception as exc:  # pragma: no cover
        logger.warning("Model preload failed: %s", exc)
    yield


app = FastAPI(title=f"{config.APP_NAME} API", version=config.VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Error handling - friendly messages, no internal stack traces
# ---------------------------------------------------------------------------
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_req: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc.detail)})


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
# URL fetching (server-side to avoid CORS)
# ---------------------------------------------------------------------------
import re as _re
from urllib.parse import urlparse

import requests as _requests
from bs4 import BeautifulSoup as _BS

# Headers that mimic a real browser so news sites don't block the request
_URL_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_URL_FETCH_TIMEOUT = 15  # seconds


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


@app.post("/api/news/fetch-url")
def fetch_news_url(payload: schemas.NewsFetchUrlRequest):
    """Fetch a news article URL server-side and extract headline + content.

    This runs on the backend to bypass CORS restrictions that browsers
    enforce on cross-origin requests to most news websites.
    """
    # Validate URL scheme
    parsed = urlparse(payload.url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only HTTP and HTTPS URLs are supported.")
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Please enter a valid URL.")

    try:
        resp = _requests.get(
            payload.url,
            headers=_URL_FETCH_HEADERS,
            timeout=_URL_FETCH_TIMEOUT,
            allow_redirects=True,
        )
    except _requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="The request timed out while fetching the article. The site may be slow or unavailable.")
    except _requests.exceptions.ConnectionError:
        raise HTTPException(status_code=502, detail="Could not connect to the URL. Please check the address and try again.")
    except _requests.exceptions.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch the URL: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"The URL returned HTTP {resp.status_code}. The article may be unavailable.",
        )

    # Only process HTML content
    content_type = resp.headers.get("Content-Type", "")
    if "text/html" not in content_type and "application/xhtml" not in content_type:
        raise HTTPException(
            status_code=400,
            detail="The URL does not point to an HTML article page.",
        )

    extracted = _extract_article_html(resp.text)

    if not extracted["content"] or len(extracted["content"]) < 50:
        raise HTTPException(
            status_code=422,
            detail="Could not extract meaningful article text from this URL. The page may use a format we cannot parse, or require JavaScript to load.",
        )

    return {
        "url": payload.url,
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
def delete_history_item(analysis_id: int, db: Session = Depends(get_db)):
    row = db.get(Analysis, analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    db.delete(row)
    db.commit()
    return {"deleted": analysis_id}


@app.delete("/api/history")
def clear_history(db: Session = Depends(get_db)):
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
def train_models(payload: schemas.TrainRequest):
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





