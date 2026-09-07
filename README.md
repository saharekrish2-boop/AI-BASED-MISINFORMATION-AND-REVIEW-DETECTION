# TruthLens AI

**AI-based Misinformation and Review Detection System**

A full-stack web application that analyzes news/articles (`REAL` vs `POTENTIALLY MISINFORMATIVE`) and customer reviews (`GENUINE` vs `SUSPICIOUS`) using real, locally-trained machine-learning models.

## Features

- **News Detector** — TF-IDF + Logistic Regression classifier with explainable signals (clickbait structure, sensational language, heavy capitalisation, sourcing language…).
- **Review Detector** — detects suspicious/fake review patterns: promotional language, generic praise, repetitive phrasing, rating/sentiment mismatch…
- **Explainability** — every verdict includes *Potential signals detected*, derived from actual measured text features and model weights (never random).
- **Dashboard, History, Analytics, Model Center** — all statistics and charts are computed from SQLite records; nothing is hardcoded or random.
- **Model Management** — retrain via UI (`POST /api/models/train`) or CLI. Ships with clearly-labelled **demo training datasets** so the app runs immediately out of the box.
- **Privacy / cost** — runs fully offline; no paid APIs.

## Project structure

```
├── backend/
│   ├── main.py                  # FastAPI app + all endpoints
│   ├── database.py              # SQLAlchemy engine/session (SQLite)
│   ├── models.py                # ORM table `analyses`
│   ├── schemas.py               # Pydantic request/response schemas + sanitisation
│   ├── config.py                # env-configurable settings
│   ├── ml/
│   │   ├── preprocessing.py     # text normalisation + TF-IDF builder
│   │   ├── news_model.py        # news classifier wrapper (sklearn pipeline)
│   │   ├── review_model.py      # review classifier wrapper
│   │   ├── model_loader.py      # thread-safe artifact loading
│   │   ├── train_news.py        # training pipeline (print metrics, save joblib)
│   │   ├── train_reviews.py
│   │   └── data/                # DEMO datasets + README explaining real data
│   ├── services/
│   │   ├── news_detector.py     # inference + signal generation
│   │   ├── review_detector.py
│   │   └── explainability.py    # text features, sentiment, signals
│   └── data/                    # SQLite database lives here (runtime)
├── ml/                          # thin wrappers so `python ml/train_*.py` works
├── frontend/
│   ├── src/
│   │   ├── components/          # layout, ui (shadcn-style), shared widgets
│   │   ├── pages/               # Landing, Dashboard, News/Review detectors, History, Analytics, Models, Settings
│   │   ├── services/api.ts      # centralized API client
│   │   ├── types/index.ts       # TS types mirroring backend schemas
│   │   └── lib/                 # utils, demo examples
│   ├── .env                     # VITE_API_URL
│   └── package.json
├── requirements.txt
└── README.md
```

## Prerequisites

- Python 3.11+
- Node.js 20+
## 1. Install dependencies

```bash
# Python (backend + ML)
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

## 2. Train the models (optional — pre-trained demo models included)

Demo datasets are generated automatically the first time training runs; no downloads needed.

```bash
python ml/train_news.py
python ml/train_reviews.py
```

Each script prints `Accuracy / Precision / Recall / F1 / Confusion Matrix` and saves:

- `backend/ml/models/news_model.joblib`
- `backend/ml/models/review_model.joblib`
- plus matching `*_metrics.json`

Models trained on the bundled generated datasets are labelled **Demo-trained model** in the UI — the accuracy figures are illustrative, not production-grade. To train on a real dataset, set `TRUTHLENS_NEWS_DATA` / `TRUTHLENS_REVIEWS_DATA` to CSV files with `label,text` columns (labels: `real|misinformative` for news, `genuine|suspicious` for reviews). See `backend/ml/data/README.md`.

## 3. Start the backend

```bash
uvicorn backend.main:app --reload --port 8000
```

- API base: http://127.0.0.1:8000
- Interactive docs (Swagger): http://127.0.0.1:8000/docs

## 4. Start the frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

`VITE_API_URL` defaults to `http://127.0.0.1:8000` (see `frontend/.env`).
## API overview

| Method | Endpoint               | Description |
|--------|------------------------|-------------|
| GET    | `/api/health`          | System + model health |
| GET    | `/api/stats`           | Dashboard statistics (live from DB) |
| GET    | `/api/history`         | Paginated/filterable/sortable history |
| GET    | `/api/history/{id}`    | Single analysis detail |
| DELETE | `/api/history/{id}`    | Delete one record |
| DELETE | `/api/history`         | Clear all records |
| POST   | `/api/news/analyze`    | News analysis |
| POST   | `/api/reviews/analyze` | Review analysis |
| GET    | `/api/analytics`       | Chart data (live from DB) |
| GET    | `/api/models/info`     | Model metadata + metrics |
| POST   | `/api/models/train`    | Retrain models (scikit-learn fitting) |

### Example request — news

```bash
curl -X POST http://127.0.0.1:8000/api/news/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "headline": "SHOCKING: Miracle cure discovered, doctors HATE this!",
    "content": "Leaked reports prove big pharma has hidden this miracle cure for YEARS...",
    "source_url": "https://example.com"
  }'
```

### Example request — review

```bash
curl -X POST http://127.0.0.1:8000/api/reviews/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "review_text": "BEST earbuds EVER!!! Absolutely life changing, everyone must buy now!",
    "product_name": "X-Earbuds Pro",
    "rating": 5,
    "verified_purchase": false
  }'
```

### Example response

```json
{
  "id": 3,
  "prediction": "suspicious",
  "confidence": 0.96,
  "model": "TF-IDF + Logistic Regression",
  "processing_time_ms": 12,
  "signals": [ { "id": "promotional-language", "title": "Excessive promotional language",
                  "description": "Marketing-style phrases found (best ever, buy it now)…",
                  "severity": "high" } ],
  "text_stats": { "word_count": 22, "exclamation_count": 3, "all_caps_ratio": 0.28 },
  "timestamp": "2026-09-06T10:00:00Z",
  "word_count": 22,
  "disclaimer": "AI predictions are probabilistic and should not be treated as definitive proof of truthfulness or fraud."
}
```
## Retraining from the UI

Open the **Model Information** page and click *Train / Update Model*. The backend performs a real scikit-learn fit, reloads the artifacts, and returns the evaluation metrics — this also works via `POST /api/models/train`.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` (frontend) | `http://127.0.0.1:8000` | Backend URL |
| `TRUTHLENS_DATABASE_URL` | `sqlite:///backend/data/truthlens.db` | Database URL |
| `TRUTHLENS_MODELS_DIR` | `backend/ml/models` | Model artifact folder |
| `TRUTHLENS_NEWS_DATA` | *(empty → demo data)* | Path to a real news CSV |
| `TRUTHLENS_REVIEWS_DATA` | *(empty → demo data)* | Path to a real reviews CSV |
| `TRUTHLENS_CORS_ORIGINS` | `*` | Comma-separated CORS origins |

## Known limitations

- Models ship **demo-trained** with small template-generated datasets; accuracy is illustrative, not production-grade. Provide a real dataset and retrain for production use.
- The classifier is a **text-style classifier** — it detects language *associated with* misinformation/suspicion, it cannot verify facts, sources, or ground truth.
- Analysis is English-oriented (sentiment lexicons are English).
- Sentiment is a lightweight lexicon-based approach (no BERT/transformer dependency) — built this way for offline/CPU-only operation.
- Confidence comes from the model's probability output; heuristic rules in `explainability.py` are clearly labelled as potential indicators.

## Disclaimer

Provided for research and demonstration. AI predictions are probabilistic and should not be treated as definitive proof of truthfulness or fraud.