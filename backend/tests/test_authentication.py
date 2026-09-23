"""Unit tests for API-key authentication and CORS restrictions.

Run from the repository root (stdlib unittest only - no httpx/pytest needed):

    python -m unittest discover -s backend/tests -t . -v
    python -m unittest backend.tests.test_authentication -v

Requests are driven straight into the ASGI app, so no network or test client
package is required. Every database write happens in a **temporary SQLite file**
(see `setUpModule`) - the development database in `backend/data/` is never
touched, so `DELETE /api/history` here cannot destroy real history.
"""
from __future__ import annotations

import asyncio
import json
import os
import re as _re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import config, database, main, models  # noqa: E402

TEST_API_KEY = "unit-test-key-0123456789abcdef"
UNTRUSTED_ORIGIN = "https://evil.example"
TMP_DB_PATH = Path(tempfile.gettempdir()) / "truthlens_test_auth_only.db"

_TEMP_ENGINE = None
_ISOLATION_PATCHES: list = []


def _install_temp_database() -> None:
    """Point the app's ORM at a throwaway SQLite file for the whole test module."""
    global _TEMP_ENGINE
    TMP_DB_PATH.unlink(missing_ok=True)
    _TEMP_ENGINE = create_engine(
        f"sqlite:///{TMP_DB_PATH.as_posix()}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    engine_patch = mock.patch.object(database, "engine", _TEMP_ENGINE)
    engine_patch.start()
    _ISOLATION_PATCHES.append(engine_patch)
    session_patch = mock.patch.object(
        database,
        "SessionLocal",
        sessionmaker(
            bind=_TEMP_ENGINE,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        ),
    )
    session_patch.start()
    _ISOLATION_PATCHES.append(session_patch)
    database.init_db()  # create the schema in the temp file


def setUpModule() -> None:  # noqa: N802 - unittest API
    _install_temp_database()


def tearDownModule() -> None:  # noqa: N802 - unittest API
    for patch in reversed(_ISOLATION_PATCHES):
        patch.stop()
    _ISOLATION_PATCHES.clear()
    if _TEMP_ENGINE is not None:
        _TEMP_ENGINE.dispose()
    TMP_DB_PATH.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Minimal ASGI driver (replacement for starlette's TestClient / httpx)
# ---------------------------------------------------------------------------
async def _drive(app, scope, body: bytes) -> list:
    sent: list = []
    state = {"sent": False}

    async def receive():
        if not state["sent"]:
            state["sent"] = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    await app(scope, receive, send)
    return sent


def call_api(
    method: str,
    path: str,
    *,
    headers: dict | None = None,
    json_body: dict | None = None,
    query: str = "",
    client: tuple = ("203.0.113.7", 5555),
):
    """Perform one request against the real app. Returns (status, headers, body)."""
    header_map = {k.lower(): v for k, v in (headers or {}).items()}
    body = b""
    if json_body is not None:
        body = json.dumps(json_body).encode()
        header_map.setdefault("content-type", "application/json")
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "path": path,
        "raw_path": path.encode(),
        "query_string": query.encode(),
        "headers": [(k.encode(), v.encode()) for k, v in header_map.items()],
        "client": client,
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
    }
    messages = asyncio.run(_drive(main.app, scope, body))
    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    response_headers = {
        k.decode().lower(): v.decode()
        for m in messages
        if m["type"] == "http.response.start"
        for k, v in m.get("headers", [])
    }
    raw = b"".join(
        m.get("body", b"") for m in messages if m["type"] == "http.response.body"
    )
    try:
        parsed = json.loads(raw) if raw else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        parsed = None
    return status, response_headers, parsed


def auth_headers(origin: str | None = None, key: str = TEST_API_KEY) -> dict:
    headers = {"X-API-Key": key}
    if origin:
        headers["Origin"] = origin
    return headers


def seed_analysis(count: int = 1) -> list[int]:
    """Insert `count` analysis rows into the temp database."""
    session = database.SessionLocal()
    ids: list[int] = []
    try:
        for index in range(count):
            row = models.Analysis(
                type="news",
                input_text=f"seed article {index} long enough to look real",
                prediction="real",
                confidence=0.9,
                model_name="test",
                processing_time=1,
                word_count=8,
                char_count=42,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            ids.append(row.id)
    finally:
        session.close()
    return ids


def count_analyses() -> int:
    session = database.SessionLocal()
    try:
        return session.query(models.Analysis).count()
    finally:
        session.close()


def truncate_analyses() -> None:
    session = database.SessionLocal()
    try:
        session.query(models.Analysis).delete(synchronize_session=False)
        session.commit()
    finally:
        session.close()


class DatabaseIsolationGuard(unittest.TestCase):
    """Fail loudly if the tests ever point at the real development database."""

    def test_temp_database_is_in_use(self):
        url = str(database.engine.url)
        self.assertIn("truthlens_test_auth_only", url)
        self.assertNotIn("truthlens.db", url.replace("truthlens_test_auth_only.db", ""))


class ApiKeyConfigurationTests(unittest.TestCase):
    """Requirement: the key comes from TRUTHLENS_API_KEY - never from source code."""

    def test_config_reads_the_key_from_the_environment_variable(self):
        self.assertEqual(config.API_KEY, os.environ.get("TRUTHLENS_API_KEY", "").strip())

    def test_key_is_not_hardcoded_in_the_backend_source(self):
        """Requirement 1: the secret is supplied at runtime, never written into code."""
        pattern = _re.compile(r"""TRUTHLENS_API_KEY["']?\s*[:=]\s*["'][^"']+["']""")
        offenders = [
            str(path.relative_to(ROOT))
            for path in sorted((ROOT / "backend").rglob("*.py"))
            if pattern.search(path.read_text(encoding="utf-8"))
        ]
        self.assertEqual(offenders, [], f"hardcoded API key literal found in: {offenders}")

    def test_header_and_scheme_defaults(self):
        self.assertEqual(config.API_KEY_HEADER, "X-API-Key")
        self.assertEqual(config.AUTH_SCHEME, "Bearer")


class UnauthenticatedAccessTests(unittest.TestCase):
    """Destructive / expensive endpoints must reject requests without a key."""

    def setUp(self):
        self._key_patch = mock.patch.object(config, "API_KEY", TEST_API_KEY)
        self._key_patch.start()
        self.addCleanup(self._key_patch.stop)
        truncate_analyses()

    def test_clear_all_history_without_key_is_401_and_deletes_nothing(self):
        seed_analysis(2)

        status, headers, body = call_api(
            "DELETE", "/api/history", headers={"Origin": "http://localhost:5173"}
        )

        self.assertEqual(status, 401)
        self.assertIn("api key", body["detail"].lower())
        self.assertIn("www-authenticate", headers)
        self.assertEqual(count_analyses(), 2)  # the guard stopped it before the route

    def test_clear_all_history_with_wrong_key_is_401(self):
        seed_analysis(1)

        status, _, _ = call_api("DELETE", "/api/history", headers=auth_headers(key="wrong-key"))

        self.assertEqual(status, 401)
        self.assertEqual(count_analyses(), 1)

    def test_delete_single_record_without_key_is_401(self):
        record_id = seed_analysis(1)[0]

        status, _, _ = call_api("DELETE", f"/api/history/{record_id}")

        self.assertEqual(status, 401)
        self.assertEqual(count_analyses(), 1)

    def test_retrain_without_key_is_401_and_never_starts_training(self):
        # Local training was removed (Groq-only pipeline): the endpoint
        # is deprecated and always answers 410, never starting any training.
        status, _, body = call_api(
            "POST", "/api/models/train", json_body={"model": "all"}
        )
        self.assertEqual(status, 410)
        self.assertIn("Groq", body["detail"])

    def test_empty_whitespace_and_malformed_keys_are_rejected(self):
        for headers in (
            {"X-API-Key": ""},
            {"X-API-Key": "   "},
            {"Authorization": "Bearer "},
            {"Authorization": "Bearer"},
            {"Authorization": f"Basic {TEST_API_KEY}"},
            {"Authorization": f"Bearer {TEST_API_KEY[:-1]}x"},  # one character off
        ):
            with self.subTest(headers=headers):
                status, _, _ = call_api("DELETE", "/api/history", headers=headers)
                self.assertEqual(status, 401)

    def test_unconfigured_server_fails_closed_with_503(self):
        with mock.patch.object(config, "API_KEY", ""):
            status, _, body = call_api("DELETE", "/api/history")

        self.assertEqual(status, 503)
        self.assertIn("TRUTHLENS_API_KEY", body["detail"])

    def test_preflight_options_is_never_blocked_by_the_auth_guard(self):
        status, _, _ = call_api(
            "OPTIONS",
            "/api/history",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "DELETE",
                "Access-Control-Request-Headers": "x-api-key",
            },
        )
        self.assertNotEqual(status, 401)


class AuthorizedAccessTests(unittest.TestCase):
    """Valid credentials must let the protected endpoints through."""

    def setUp(self):
        self._key_patch = mock.patch.object(config, "API_KEY", TEST_API_KEY)
        self._key_patch.start()
        self.addCleanup(self._key_patch.stop)
        truncate_analyses()

    def test_clear_all_history_with_valid_key_succeeds(self):
        seed_analysis(3)

        status, _, body = call_api("DELETE", "/api/history", headers=auth_headers())

        self.assertEqual(status, 200)
        self.assertEqual(body["deleted"], 3)
        self.assertEqual(count_analyses(), 0)

    def test_delete_single_record_with_valid_key_succeeds(self):
        _keep_id, remove_id = seed_analysis(2)

        status, _, body = call_api(
            "DELETE", f"/api/history/{remove_id}", headers=auth_headers()
        )

        self.assertEqual(status, 200)
        self.assertEqual(body["deleted"], remove_id)
        self.assertEqual(count_analyses(), 1)

    def test_bearer_token_is_accepted(self):
        seed_analysis(1)

        status, _, body = call_api(
            "DELETE", "/api/history", headers={"Authorization": f"Bearer {TEST_API_KEY}"}
        )

        self.assertEqual(status, 200)
        self.assertEqual(body["deleted"], 1)

    def test_lowercase_header_name_is_accepted(self):
        """HTTP header names are case-insensitive."""
        status, _, _ = call_api("DELETE", "/api/history", headers={"x-api-key": TEST_API_KEY})
        self.assertEqual(status, 200)

    def test_retrain_endpoint_is_deprecated_groq_only(self):
        # POST /api/models/train is deprecated: local sklearn training was
        # removed; all analysis routes through Groq. Always 410.
        status, _, body = call_api(
            "POST", "/api/models/train", json_body={"model": "all"}, headers=auth_headers()
        )
        self.assertEqual(status, 410)
        self.assertIn("Groq", body["detail"])

    def test_retrain_scope_news_only(self):
        status, _, body = call_api(
            "POST", "/api/models/train", json_body={"model": "news"}, headers=auth_headers()
        )
        self.assertEqual(status, 410)

    def test_public_endpoints_need_no_key(self):
        """Read endpoints stay open; analysis needs GROQ_API_KEY (mocked)."""
        fake_result = {
            "prediction": "real", "confidence": 0.9, "credibility_score": 0.9,
            "bias_level": "low", "explanation": "Mocked Groq verdict.",
            "model": "Groq/test", "processing_time_ms": 5,
            "signals": [], "text_stats": {
                "word_count": 10, "char_count": 50, "sentence_count": 1,
                "avg_word_length": 5.0, "exclamation_count": 0, "question_count": 0,
                "all_caps_ratio": 0.0, "unique_word_ratio": 0.9,
                "caps_word_count": 0, "caps_letter_count": 0, "letter_count": 40,
            },
            "word_count": 10, "sentiment": "neutral",
        }
        cases = (
            ("GET", "/api/health", None),
            ("GET", "/api/stats", None),
            ("GET", "/api/history", None),
            ("GET", "/api/analytics", None),
            ("GET", "/api/models/info", None),
            (
                "POST",
                "/api/news/analyze",
                {
                    "headline": "City council approves transport budget",
                    "content": (
                        "Officials confirmed the transport programme remains on schedule and "
                        "within budget, according to a statement released on Tuesday."
                    ),
                },
            ),
        )
        for method, path, body in cases:
            with self.subTest(method=method, path=path):
                if path == "/api/news/analyze":
                    with mock.patch.object(
                            main.news_detector, "analyze_news",
                            return_value=dict(fake_result)) as m:
                        status, _, _ = call_api(method, path, json_body=body)
                        m.assert_called_once()
                else:
                    status, _, _ = call_api(method, path, json_body=body)
                self.assertEqual(status, 200)


class CorsRestrictionTests(unittest.TestCase):
    """Only trusted frontend origins may call the API from a browser."""

    TRUSTED = "http://localhost:5173"
    PRODUCTION = "https://truthlens.ai"

    def setUp(self):
        self._key_patch = mock.patch.object(config, "API_KEY", TEST_API_KEY)
        self._key_patch.start()
        self.addCleanup(self._key_patch.stop)
        truncate_analyses()

    def test_default_allowlist_is_a_whitelist_not_a_wildcard(self):
        self.assertNotIn("*", config.CORS_ORIGINS)
        self.assertEqual(config.CORS_ORIGINS, config.DEFAULT_CORS_ORIGINS)
        self.assertIn(self.TRUSTED, config.CORS_ORIGINS)
        self.assertIn(self.PRODUCTION, config.CORS_ORIGINS)

    def test_preflight_from_trusted_origin_is_allowed(self):
        status, headers, _ = call_api(
            "OPTIONS",
            "/api/history",
            headers={
                "Origin": self.TRUSTED,
                "Access-Control-Request-Method": "DELETE",
                "Access-Control-Request-Headers": "x-api-key",
            },
        )

        self.assertEqual(status, 200)
        self.assertEqual(headers.get("access-control-allow-origin"), self.TRUSTED)
        self.assertIn("DELETE", headers.get("access-control-allow-methods", ""))
        self.assertIn("x-api-key", headers.get("access-control-allow-headers", "").lower())

    def test_preflight_from_untrusted_origin_is_blocked(self):
        status, headers, _ = call_api(
            "OPTIONS",
            "/api/models/train",
            headers={
                "Origin": UNTRUSTED_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-api-key",
            },
        )

        self.assertNotIn("access-control-allow-origin", headers)
        self.assertNotEqual(status, 200)

    def test_simple_request_from_trusted_origin_gets_cors_headers(self):
        status, headers, _ = call_api("GET", "/api/health", headers={"Origin": self.PRODUCTION})

        self.assertEqual(status, 200)
        self.assertEqual(headers.get("access-control-allow-origin"), self.PRODUCTION)

    def test_simple_request_from_untrusted_origin_has_no_cors_headers(self):
        """The browser blocks the response: no Access-Control-Allow-Origin."""
        status, headers, _ = call_api("GET", "/api/stats", headers={"Origin": UNTRUSTED_ORIGIN})

        self.assertEqual(status, 200)  # server-side processing is unaffected...
        self.assertNotIn("access-control-allow-origin", headers)  # ...but JS cannot read it

    def test_untrusted_origin_with_valid_key_still_gets_no_cors_header(self):
        """CORS is browser-side; the API key is the real gate for non-browser callers."""
        seed_analysis(1)

        status, headers, _ = call_api(
            "DELETE", "/api/history", headers=auth_headers(origin=UNTRUSTED_ORIGIN)
        )

        self.assertEqual(status, 200)
        self.assertNotIn("access-control-allow-origin", headers)
        self.assertEqual(count_analyses(), 0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main(verbosity=2)
