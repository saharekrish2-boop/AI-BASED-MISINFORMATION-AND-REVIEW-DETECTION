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
| DELETE | `/api/history/{id}`    | Delete one record (**🔒 API key required**) |
| DELETE | `/api/history`         | Clear all records (**🔒 API key required**) |
| POST   | `/api/news/analyze`    | News analysis (public) |
| POST   | `/api/news/fetch-url`  | Fetch + extract a public article URL (SSRF-hardened, rate-limited; 🔒 only with `TRUTHLENS_PROTECT_FETCH_URL=true`) |
| POST   | `/api/reviews/analyze` | Review analysis (public) |
| GET    | `/api/analytics`       | Chart data (live from DB) |
| GET    | `/api/models/info`     | Model metadata + metrics |
| POST   | `/api/models/train`    | Retrain models (scikit-learn fitting) (**🔒 API key required**) |

🔒 **Protected endpoints** need the shared API key in the `X-API-Key` header (or
`Authorization: Bearer <key>`); requests without it get **401 Unauthorized**. See
[Security Notes → Authentication](#authentication-for-sensitive-endpoints-api-key).

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

Open the **Model Information** page and click *Train / Update Model*. The backend performs a real scikit-learn fit, reloads the artifacts, and returns the evaluation metrics — this also works via `POST /api/models/train`. Retraining is a **protected** action: store the API key in **Settings → API key** (or set `VITE_API_KEY`) first, otherwise the backend answers `401`.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` (frontend) | `http://127.0.0.1:8000` | Backend URL |
| `TRUTHLENS_DATABASE_URL` | `sqlite:///backend/data/truthlens.db` | Database URL |
| `TRUTHLENS_MODELS_DIR` | `backend/ml/models` | Model artifact folder |
| `TRUTHLENS_NEWS_DATA` | *(empty → demo data)* | Path to a real news CSV |
| `TRUTHLENS_REVIEWS_DATA` | *(empty → demo data)* | Path to a real reviews CSV |
| `TRUTHLENS_API_KEY` | *(empty → protected routes return 503)* | Shared API key for sensitive endpoints. Generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `TRUTHLENS_PROTECT_FETCH_URL` | `false` | Also require the API key for `POST /api/news/fetch-url` |
| `TRUTHLENS_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173,https://truthlens.ai` | Comma-separated CORS allow-list (a whitelist — `*` is not used) |
| `TRUTHLENS_FETCH_TIMEOUT` | `10` | Seconds allowed for one article request |
| `TRUTHLENS_FETCH_MAX_BYTES` | `2097152` (2 MB) | Max article body downloaded; larger replies get HTTP 413 |
| `TRUTHLENS_FETCH_MAX_REDIRECTS` | `3` | Redirect hops allowed (each one re-validated) |
| `TRUTHLENS_FETCH_USER_AGENT` | `TruthLensFetcher/1.0` | Neutral User-Agent used for outbound fetches |
| `TRUTHLENS_FETCH_RATE_LIMIT` | `10` | Allowed `fetch-url` requests per client IP… |
| `TRUTHLENS_FETCH_RATE_WINDOW` | `60` | …per this many seconds |
| `VITE_API_KEY` (frontend) | *(empty)* | API key sent as `X-API-Key`; can also be pasted in **Settings → API key** (stored in `localStorage`) |

## Security Notes

### Authentication for sensitive endpoints (API key)

Everything that destroys data or burns CPU requires an API key; the analysis and
read endpoints stay public so the demo works out of the box.

| Endpoint | Auth required | Why |
|---|---|---|
| `DELETE /api/history` | **Yes** | Wipes every analysis record |
| `DELETE /api/history/{id}` | **Yes** | Deletes a record |
| `POST /api/models/train` | **Yes** | CPU-heavy scikit-learn retraining |
| `POST /api/news/fetch-url` | Only with `TRUTHLENS_PROTECT_FETCH_URL=true` | Outbound request (already SSRF-hardened + rate-limited) |
| `POST /api/news/analyze`, `POST /api/reviews/analyze`, all `GET` endpoints | No | Public analysis & read access |

**1. Generate and set the key** (never commit it):

```bash
# Generate a strong key
python -c "import secrets; print(secrets.token_urlsafe(32))"

# bash
export TRUTHLENS_API_KEY="<paste-the-generated-key>"
# PowerShell
$env:TRUTHLENS_API_KEY = "<paste-the-generated-key>"
# Windows cmd
set TRUTHLENS_API_KEY=<paste-the-generated-key>

uvicorn backend.main:app --reload --port 8000
```

Or keep the secret in a **git-ignored file** and let uvicorn load it (`python-dotenv`
is already installed as part of `uvicorn[standard]`):

```bash
# backend/.env   <- git-ignored by the root .gitignore - never commit it
TRUTHLENS_API_KEY=<paste-the-generated-key>

uvicorn backend.main:app --reload --port 8000 --env-file backend/.env
```

The key is read **once at import time**, so restart the backend after changing it.

On startup the backend logs the posture, e.g.
`API key authentication ENABLED for: DELETE ^/api/history/?$, …` (the key itself is never logged).
If `TRUTHLENS_API_KEY` is **not** set, sensitive routes **fail closed** and answer
**HTTP 503** ("API key authentication is not configured …") instead of silently
allowing anyone to delete data. A key shorter than 16 characters triggers a warning.

**2. Call protected endpoints:**

```bash
# Clear all history (preferred: X-API-Key header)
curl -X DELETE http://127.0.0.1:8000/api/history \
  -H "X-API-Key: $TRUTHLENS_API_KEY"

# Retrain (Bearer style is accepted too)
curl -X POST http://127.0.0.1:8000/api/models/train \
  -H "Authorization: Bearer $TRUTHLENS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"all"}'
```

Responses:

| Situation | Status | Notes |
|---|---|---|
| No key / wrong key | **401** | `WWW-Authenticate: Bearer realm="TruthLens API"`; the request never reaches the handler — verified by tests that assert no row is deleted |
| Server has no `TRUTHLENS_API_KEY` | **503** | Fail closed + instructions in `detail` |
| Valid key | 200 | Normal endpoint response |

The check is performed twice on purpose: an `api_key_guard` middleware keyed on the
method + path (so any future route added under `/api/history` or
`/api/models/train` is protected automatically) **and** an explicit
`Depends(require_api_key)` in each protected endpoint signature. Comparisons use
`secrets.compare_digest` (constant time). CORS preflight (`OPTIONS`) is never
blocked, because browsers do not attach credentials to preflight requests.

**3. Frontend:** paste the key in **Settings → API key** (kept in the browser's
`localStorage`) or provide it at build time with `VITE_API_KEY`. The client sends
it as `X-API-Key` on every request; the Settings and Model Information pages show
the backend's 401/503 explanation if it is missing or wrong.

> ⚠️ `VITE_*` values are compiled into the JavaScript bundle, so a key set that way is
> readable by anyone who can load the frontend. Use it only for local development;
> for a public deployment leave `VITE_API_KEY` empty and paste the key in
> **Settings → API key** (or route the API behind a gateway that injects the header).

### CORS (trusted frontend origins only)

`allow_origins` is an explicit **whitelist** — `*` is no longer used:

- `http://localhost:5173` — Vite dev server (development)
- `http://127.0.0.1:5173` — the same dev server reached via IP
- `https://truthlens.ai` — production frontend

Only those origins receive `Access-Control-Allow-Origin`, so any other website
(e.g. `https://evil.example`) is blocked by the browser even though curl or a
server-side client can still talk to the API — CORS is a browser control, which
is exactly why the API key exists for non-browser callers. Allowed methods are
`GET, POST, DELETE, OPTIONS` and allowed headers are `Content-Type, Accept,
Authorization, X-API-Key`. Add extra origins (a LAN address, a `vite preview`
port, a staging domain) with the comma-separated `TRUTHLENS_CORS_ORIGINS`
variable; setting it replaces the default list.

### Server-side URL fetching (`POST /api/news/fetch-url`)

The article fetcher runs on the server, so an unguarded implementation is a
**Server-Side Request Forgery (SSRF)** and denial-of-service vector. All
outbound fetching now goes through `safe_fetch_url()` in `backend/main.py`,
which enforces:

| Control | Behaviour |
|---|---|
| **Public targets only** | The hostname is resolved (IPv4 + IPv6) and **every** returned address is checked. Loopback (`127.0.0.0/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`), link-local (`169.254/16`, `fe80::/10`), CGNAT (`100.64/10`), multicast/reserved/test ranges and cloud-metadata IPs (`169.254.169.254`, `100.100.100.200`, `fd00:ec2::254`) are rejected with **HTTP 400**. IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is unwrapped first, and mixed DNS answers **fail closed** (one private answer rejects the request). |
| **Scheme / credential rules** | Only `http` and `https`; URLs containing embedded credentials (`https://user:pass@…`) are rejected; DNS failures return 400 instead of leaking resolver details. |
| **No automatic redirects** | `allow_redirects=False`. Each `3xx` `Location` is re-validated (scheme + resolved IP) before the next hop, and the chain is capped at `TRUTHLENS_FETCH_MAX_REDIRECTS` (400 when exceeded) — a redirect to `127.0.0.1` or to instance metadata is therefore blocked, not followed. |
| **Response size cap** | The body is streamed (`stream=True`) and aborted beyond `TRUTHLENS_FETCH_MAX_BYTES` (2 MB default) → **HTTP 413**; an oversized `Content-Length` is rejected before the download starts, and the connection is always closed. |
| **Timeout** | `TRUTHLENS_FETCH_TIMEOUT` (10 s default) → **HTTP 504**; connection failures → 502. |
| **Rate limiting** | A dependency-free sliding-window limiter is applied as FastAPI middleware to this path only: `TRUTHLENS_FETCH_RATE_LIMIT` requests per `TRUTHLENS_FETCH_RATE_WINDOW` per client IP (**HTTP 429** + `Retry-After`). Other routes are untouched. `slowapi` is not required; the middleware is a drop-in equivalent if you prefer it. |
| **Neutral User-Agent** | Outbound requests identify themselves as `TruthLensFetcher/1.0` (configurable) instead of spoofing a browser, and ambient `HTTP(S)_PROXY` environment variables are ignored (`Session.trust_env = False`). |
| **HTML only** | Non-HTML responses (`Content-Type` other than `text/html` / `application/xhtml+xml`) are rejected with 400. |

**Residual risk:** DNS is resolved once for validation and again by the HTTP
client, so a hostile resolver could rebind between the two lookups (classic
TOCTOU). Run the backend behind an egress-restricted proxy/firewall if you must
defend against that; fetched text is only ever analysed locally and never
executed.

### Tests

The security controls are covered by offline unit tests (stdlib `unittest`, no
extra dependencies — DNS, HTTP and the SQLite database are faked/isolated):

```bash
python -m unittest discover -s backend/tests -t . -v
```

`backend/tests/test_fetch_url_security.py` (25 tests) — SSRF guards: a normal
public URL succeeds, a redirect to `127.0.0.1` is blocked, a >2 MB page returns
413, private/metadata IP literals and private-resolving hostnames are blocked,
redirect loops are capped, non-HTML and error responses are handled, and the rate
limiter returns 429 + `Retry-After`.

`backend/tests/test_authentication.py` (21 tests) — a temporary SQLite file is
used for every write, so the development database is never affected:

- unauthenticated `DELETE /api/history` → **401** and *nothing is deleted* (the
  guard runs before the handler), same for `DELETE /api/history/{id}` and
  `POST /api/models/train` (asserts training is never started);
- wrong, empty, whitespace, malformed or off-by-one keys → 401; an unconfigured
  server → 503 (fail closed);
- a valid `X-API-Key` (and `Authorization: Bearer …`) → 200, records actually
  deleted / retraining invoked, artifacts reloaded;
- public endpoints (`/api/health`, `/api/stats`, `/api/history`, `/api/analytics`,
  `/api/models/info`, `POST /api/news/analyze`) still answer 200 without a key;
- CORS: preflight and simple requests from `http://localhost:5173` and
  `https://truthlens.ai` receive `Access-Control-Allow-Origin`, requests from an
  untrusted origin receive **no** CORS headers, and `*` is not in the default
  allow-list.

## Known limitations

- Models ship **demo-trained** with small template-generated datasets; accuracy is illustrative, not production-grade. Provide a real dataset and retrain for production use.
- The classifier is a **text-style classifier** — it detects language *associated with* misinformation/suspicion, it cannot verify facts, sources, or ground truth.
- Analysis is English-oriented (sentiment lexicons are English).
- Sentiment is a lightweight lexicon-based approach (no BERT/transformer dependency) — built this way for offline/CPU-only operation.
- Confidence comes from the model's probability output; heuristic rules in `explainability.py` are clearly labelled as potential indicators.

## Disclaimer

Provided for research and demonstration. AI predictions are probabilistic and should not be treated as definitive proof of truthfulness or fraud.