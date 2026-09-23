"""Pydantic request/response schemas with input sanitisation."""
import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from . import config

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200d\ufeff]")


def sanitize_text(value: str) -> str:
    """Strip control characters / zero-width chars; never executes input."""
    return _CONTROL_CHARS.sub("", value).strip()


class Signal(BaseModel):
    id: str
    title: str
    description: str
    severity: Literal["high", "medium", "low", "positive", "info"]


class TextStats(BaseModel):
    word_count: int
    char_count: int
    sentence_count: int
    avg_word_length: float
    exclamation_count: int
    question_count: int
    all_caps_ratio: float
    unique_word_ratio: float


# --------------------------------------------------------------------------
# Requests
# --------------------------------------------------------------------------
class NewsAnalyzeRequest(BaseModel):
    headline: str = Field(default="", max_length=config.MAX_HEADLINE_LENGTH)
    content: str = Field(min_length=1, max_length=config.MAX_CONTENT_LENGTH)
    source_url: Optional[str] = Field(default=None, max_length=512)

    @field_validator("headline", "content", "source_url", mode="after")
    @classmethod
    def _clean(cls, v):
        return sanitize_text(v) if v else v

    @model_validator(mode="after")
    def _validate_lengths(self):
        combined = f"{self.headline} {self.content}".strip()
        if len(combined) < config.MIN_NEWS_LENGTH:
            raise ValueError(
                f"Please provide at least {config.MIN_NEWS_LENGTH} characters of "
                "headline or article text to analyse."
            )
        return self


class ReviewAnalyzeRequest(BaseModel):
    review_text: str = Field(min_length=1, max_length=config.MAX_REVIEW_LENGTH)
    product_name: Optional[str] = Field(default=None, max_length=200)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    verified_purchase: Optional[bool] = None

    @field_validator("review_text", "product_name", mode="after")
    @classmethod
    def _clean(cls, v):
        return sanitize_text(v) if v else v

    @model_validator(mode="after")
    def _validate_lengths(self):
        if len(self.review_text) < config.MIN_REVIEW_LENGTH:
            raise ValueError(
                f"Please enter at least {config.MIN_REVIEW_LENGTH} characters of "
                "review text to analyse."
            )
        return self


class TrainRequest(BaseModel):
    model: Literal["all", "news", "reviews", "general"] = "all"


class GeneralAnalyzeRequest(BaseModel):
    content: str = Field(min_length=1, max_length=config.MAX_GENERAL_LENGTH)
    content_type: Literal["post", "blog", "description", "article"] = "post"

    @field_validator("content", mode="after")
    @classmethod
    def _clean(cls, v):
        return sanitize_text(v) if v else v

    @model_validator(mode="after")
    def _validate_lengths(self):
        if len(self.content) < config.MIN_GENERAL_LENGTH:
            raise ValueError(
                f"Please enter at least {config.MIN_GENERAL_LENGTH} characters "
                "of content to analyse."
            )
        return self


class NewsFetchUrlRequest(BaseModel):
    url: str = Field(..., max_length=2048)

    @field_validator("url", mode="after")
    @classmethod
    def _clean(cls, v):
        return sanitize_text(v) if v else v


# --------------------------------------------------------------------------
# Responses
# --------------------------------------------------------------------------
DISCLAIMER = (
    "AI predictions are probabilistic and should not be treated as definitive "
    "proof of truthfulness or fraud."
)


class BaseAnalysisResponse(BaseModel):
    id: int
    prediction: str
    confidence: float
    credibility_score: Optional[float] = None
    bias_level: Optional[str] = None
    explanation: Optional[str] = None
    model: str
    processing_time_ms: int
    signals: list[Signal]
    text_stats: TextStats
    timestamp: datetime
    word_count: int
    disclaimer: str = DISCLAIMER


class NewsAnalysisResponse(BaseAnalysisResponse):
    headline: str = ""
    sentiment: str
    source_url: Optional[str] = None


class ReviewAnalysisResponse(BaseAnalysisResponse):
    product_name: Optional[str] = None
    rating: Optional[int] = None
    verified_purchase: Optional[bool] = None
    authenticity_indicators: Optional[list[str]] = None
    sentiment: str


class GeneralAnalysisResponse(BaseAnalysisResponse):
    content_type: str = "post"
    sentiment: str


class HistoryItem(BaseModel):
    id: int
    type: str
    headline: Optional[str] = None
    input_text: str
    source_url: Optional[str] = None
    product_name: Optional[str] = None
    rating: Optional[int] = None
    verified_purchase: Optional[bool] = None
    prediction: str
    confidence: float
    sentiment: Optional[str] = None
    model_name: str
    processing_time: int
    signals: list[Signal]
    text_stats: Optional[TextStats] = None
    word_count: int
    char_count: int
    created_at: datetime


class HistoryResponse(BaseModel):
    items: list[HistoryItem]
    total: int
    page: int
    page_size: int


class ModelMetricsSummary(BaseModel):
    trained: bool
    accuracy: Optional[float] = None
    demo_data: bool = False
    last_trained: Optional[str] = None
    algorithm: Optional[str] = None


class StatsResponse(BaseModel):
    total_analyses: int
    news_count: int
    review_count: int
    general_count: int = 0
    suspicious_count: int
    misinformative_count: int
    fake_review_count: int
    real_count: int
    genuine_count: int
    avg_confidence: Optional[float] = None
    detection_accuracy: Optional[float] = None
    news_model: ModelMetricsSummary
    review_model: ModelMetricsSummary


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    database: bool
    news_model: bool
    review_model: bool
    analysis_engine: bool
    timestamp: datetime


class AnalyticsResponse(BaseModel):
    has_data: bool
    total: int
    news_results: dict[str, int]
    review_results: dict[str, int]
    type_counts: dict[str, int]
    confidence_buckets: list[dict]
    daily_volume: list[dict]
    sentiment_distribution: dict[str, int]
    suspicious_rate: float
    daily_suspicious_rate: list[dict]


class ModelInfoResponse(BaseModel):
    key: str
    name: str
    algorithm: str
    vectorizer: str
    classifier: str
    trained: bool
    demo_data: bool
    training_samples: Optional[int] = None
    test_samples: Optional[int] = None
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    confusion_matrix: Optional[list[list[int]]] = None
    labels: Optional[list[str]] = None
    last_trained: Optional[str] = None
    data_source: Optional[str] = None


class TrainResponse(BaseModel):
    success: bool
    message: str
    news: Optional[dict] = None
    reviews: Optional[dict] = None
    elapsed_ms: int

