"""Training pipeline for the review authenticity model.

Usage:
    python ml/train_reviews.py           (from repository root)
    python -m backend.ml.train_reviews
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from .. import config
from .data.demo_data import save_demo_data
from .preprocessing import normalize_text
from .review_model import MODEL_NAME, build_pipeline

LABELS = ["genuine", "suspicious"]
POS_LABEL = "suspicious"


def resolve_data_path() -> tuple[Path, str]:
    if config.REVIEW_DATA_PATH:
        p = Path(config.REVIEW_DATA_PATH)
        if not p.exists():
            raise FileNotFoundError(f"TRUTHLENS_REVIEWS_DATA points to a missing file: {p}")
        return p, "real dataset (user provided)"
    _, demo_path = save_demo_data()
    return demo_path, "demo dataset (generated)"


def load_dataframe(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df[["label", "text"]].dropna()
    df["label"] = df["label"].str.strip().str.lower()
    df = df[df["label"].isin(LABELS)]
    if df["label"].nunique() < 2:
        raise ValueError("Dataset must contain both 'genuine' and 'suspicious' labels.")
    return df


def train(output_dir: Path | None = None, verbose: bool = True) -> dict:
    data_path, data_source = resolve_data_path()
    df = load_dataframe(data_path)

    X = df["text"].astype(str).apply(normalize_text)
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred))
    precision = float(precision_score(y_test, y_pred, pos_label=POS_LABEL, zero_division=0))
    recall = float(recall_score(y_test, y_pred, pos_label=POS_LABEL, zero_division=0))
    f1 = float(f1_score(y_test, y_pred, pos_label=POS_LABEL, zero_division=0))
    cm = confusion_matrix(y_test, y_pred, labels=LABELS).tolist()

    metrics = {
        "model": "reviews",
        "name": "Review Detection Model",
        "algorithm": MODEL_NAME,
        "vectorizer": "TF-IDF (word 1-2 grams, sublinear tf)",
        "classifier": "Logistic Regression",
        "data_source": data_source,
        "data_file": data_path.name,
        "demo_data": "demo" in data_source,
        "total_samples": int(len(df)),
        "training_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "confusion_matrix": cm,
        "labels": LABELS,
        "feature_count": int(len(pipeline.named_steps["tfidf"].get_feature_names_out())),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    out_dir = Path(output_dir) if output_dir else config.MODELS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, config.REVIEW_MODEL_PATH)
    with config.REVIEW_METRICS_PATH.open("w", encoding="utf-8") as fh:
        json.dump(metrics, fh, indent=2)

    if verbose:
        print("=" * 62)
        print("REVIEW DETECTION MODEL - TRAINING REPORT")
        print("=" * 62)
        print(f"Data source      : {data_source} ({data_path.name})")
        print(f"Samples          : {len(df)} total | {len(X_train)} train | {len(X_test)} test")
        print(f"TF-IDF features  : {metrics['feature_count']}")
        print(f"Accuracy         : {accuracy:.4f}")
        print(f"Precision        : {precision:.4f}  (pos_label={POS_LABEL})")
        print(f"Recall           : {recall:.4f}")
        print(f"F1 Score         : {f1:.4f}")
        print(f"Confusion matrix : {LABELS}")
        for row in cm:
            print(f"                   {row}")
        if metrics["demo_data"]:
            print("NOTE: trained on DEMO data - accuracy is illustrative only.")
        print(f"Saved model      : {config.REVIEW_MODEL_PATH}")
        print(f"Saved metrics    : {config.REVIEW_METRICS_PATH}")
        print("=" * 62)
    return metrics


if __name__ == "__main__":
    train()
