"""SQLAlchemy ORM models for TruthLens AI."""
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Analysis(Base):
    """A single analysis record (news article or customer review)."""

    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # news | review
    input_text: Mapped[str] = mapped_column(Text, nullable=False)
    headline: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verified_purchase: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    prediction: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    sentiment: Mapped[str | None] = mapped_column(String(16), nullable=True)
    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    processing_time: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    signals: Mapped[str | None] = mapped_column(Text, nullable=True)       # JSON array
    text_stats: Mapped[str | None] = mapped_column(Text, nullable=True)    # JSON object
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    char_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_analyses_type_prediction", "type", "prediction"),
        Index("ix_analyses_created_type", "created_at", "type"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Analysis id={self.id} type={self.type} prediction={self.prediction}>"
