"""News misinformation detection model (TF-IDF + Logistic Regression)."""
from __future__ import annotations

import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from .preprocessing import build_vectorizer, normalize_text

MODEL_NAME = "TF-IDF + Logistic Regression"
LABELS = ["real", "misinformative"]
POSITIVE_LABEL = "misinformative"  # class at index 1 after sorted classes_


def build_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("tfidf", build_vectorizer()),
            ("clf", LogisticRegression(max_iter=1000, C=1.0, class_weight="balanced")),
        ]
    )


class NewsModel:
    """Wrapper around the trained sklearn pipeline for news classification."""

    MODEL_NAME = MODEL_NAME
    LABELS = LABELS

    def __init__(self, pipeline: Pipeline):
        self.pipeline = pipeline

    @classmethod
    def load(cls, path) -> "NewsModel":
        pipeline = joblib.load(path)
        return cls(pipeline)

    def predict(self, text: str) -> tuple[str, float]:
        """Return (prediction, confidence) using model probabilities."""
        normalized = normalize_text(text)
        proba = self.pipeline.predict_proba([normalized])[0]
        classes = [str(c) for c in self.pipeline.classes_]
        best_idx = max(range(len(proba)), key=lambda i: proba[i])
        return classes[best_idx], float(proba[best_idx])

    def top_terms(self, text: str, k: int = 5) -> list[dict]:
        """Return the top-k TF-IDF terms contributing to the predicted class.

        Contribution = tf-idf weight x class coefficient. Derived from the
        actual vectorizer/coef_ values, not heuristics.
        """
        vec = self.pipeline.named_steps["tfidf"]
        clf = self.pipeline.named_steps["clf"]
        normalized = normalize_text(text)
        row = vec.transform([normalized]).toarray()[0]
        if not row.any():
            return []
        classes = [str(c) for c in self.pipeline.classes_]
        coef = clf.coef_[0]
        # Coefficients point towards classes_[1] (alphabetically last label).
        sign = 1.0 if classes[1] == POSITIVE_LABEL else -1.0
        contributions = row * coef * sign
        feature_names = vec.get_feature_names_out()
        top_idx = sorted(range(len(contributions)), key=lambda i: contributions[i], reverse=True)[:k]
        return [
            {"term": feature_names[i], "weight": round(float(contributions[i]), 4)}
            for i in top_idx
            if contributions[i] > 0
        ]
