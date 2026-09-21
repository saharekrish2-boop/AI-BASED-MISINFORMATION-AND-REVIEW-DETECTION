"""Unit tests for the SSRF-hardened article fetcher (`POST /api/news/fetch-url`).

Run from the repository root (no extra dependencies - stdlib unittest only):

    python -m unittest discover -s backend/tests -t . -v
    python -m unittest backend.tests.test_fetch_url_security -v

Every test is offline: DNS and HTTP are replaced with deterministic fakes, so
no real socket is opened and no external site is contacted.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

from starlette.requests import Request
from starlette.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:  # allow `python -m unittest discover -s backend/tests`
    sys.path.insert(0, str(ROOT))

from backend import config, main, schemas  # noqa: E402

PUBLIC_IP = "93.184.216.34"          # example.com (public)
PUBLIC_URL = "https://news.example.com/story"


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class FakeResponse:
    """Minimal stand-in for ``requests.Response`` (streaming aware)."""

    def __init__(
        self,
        *,
        status_code: int = 200,
        headers: dict | None = None,
        chunks: list | tuple = (),
        encoding: str = "utf-8",
    ) -> None:
        self.status_code = status_code
        self.headers = dict(headers or {})
        self._chunks = list(chunks)
        self.encoding = encoding
        self.closed = False

    def iter_content(self, chunk_size: int = 65536):
        for chunk in self._chunks:
            yield chunk

    def close(self) -> None:
        self.closed = True


class FakeSession:
    """Replays scripted responses and records the outgoing requests."""

    def __init__(self, responses: list) -> None:
        self._responses = list(responses)
        self.requests: list[dict] = []
        self.trust_env = True
        self.closed = False

    def get(self, url: str, **kwargs) -> FakeResponse:
        self.requests.append({"url": url, **kwargs})
        if not self._responses:
            return FakeResponse(chunks=[b"<html></html>"])
        return self._responses.pop(0)

    def close(self) -> None:
        self.closed = True


class SessionFactory:
    """Callable that mimics ``requests.Session()`` and exposes the instances."""

    def __init__(self, responses: list) -> None:
        self.responses = list(responses)
        self.sessions: list[FakeSession] = []

    def __call__(self) -> FakeSession:
        session = FakeSession(self.responses)
        self.sessions.append(session)
        return session


DNS_MAP = {
    "news.example.com": PUBLIC_IP,
    "www.example.com": PUBLIC_IP,
    "internal.example.com": "10.1.2.3",
    "mixed.example.com": "10.0.0.99",
    "loopback.example.com": "127.0.0.1",
    "v6.example.com": "2606:4700::6810:84e5",
}


def fake_getaddrinfo(host, port, *args, **kwargs):
    """Deterministic DNS: IP literals resolve to themselves, else consult DNS_MAP."""
    host = str(host).strip("[]").lower()
    try:  # numeric host -> itself (mirrors real resolver behaviour)
        ipaddress.ip_address(host)
        ip = host
    except ValueError:
        ip = DNS_MAP.get(host)
        if ip is None:
            raise socket.gaierror(f"unknown host: {host}") from None
    family = socket.AF_INET6 if ":" in ip else socket.AF_INET
    addr = (ip, port, 0, 0) if family == socket.AF_INET6 else (ip, port)
    return [(family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", addr)]


def html_page(body: str = "Public article body text that is long enough.") -> list:
    return [f"<html><head><title>Story</title></head><body><p>{body}</p></body></html>".encode()]


def make_request(path: str = "/api/news/fetch-url", method: str = "POST", host: str = "203.0.113.7"):
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "client": (host, 51234),
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
    }
    return Request(scope)


async def _next_ok(_request):
    return JSONResponse({"ok": True})


class FetchTestCase(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch("backend.main.socket.getaddrinfo", side_effect=fake_getaddrinfo)
        patched.start()
        self.addCleanup(patched.stop)

    def patch_session(self, responses: list = ()) -> SessionFactory:
        factory = SessionFactory(list(responses))
        patched = mock.patch("backend.main._requests.Session", factory)
        patched.start()
        self.addCleanup(patched.stop)
        return factory

    # ------------------------------------------------------------------
    # URL / target validation (blocks the SSRF primitives)
    # ------------------------------------------------------------------
    def test_loopback_private_and_metadata_targets_are_blocked(self):
        blocked_urls = (
            "http://127.0.0.1/",
            "http://127.0.0.1:8000/api/history",
            "http://10.0.0.5/",
            "http://172.16.0.9/",
            "http://192.168.1.10:8080/",
            "http://169.254.169.254/latest/meta-data/",  # AWS/GCP/Azure metadata
            "http://100.100.100.200/latest/meta-data/",  # Alibaba metadata
            "http://0.0.0.0/",
            "http://[::1]/",
            "http://[fd00::1]/",
            "http://[fe80::1]/",
            "http://[::ffff:127.0.0.1]/",  # IPv4-mapped loopback
        )
        for url in blocked_urls:
            with self.subTest(url=url):
                with self.assertRaises(main.HTTPException) as ctx:
                    main.safe_fetch_url(url)
                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("non-public", ctx.exception.detail)

    def test_hostname_resolving_to_internal_addresses_is_blocked(self):
        for url in (
            "http://internal.example.com/article",   # -> 10.1.2.3
            "http://loopback.example.com/article",   # -> 127.0.0.1
        ):
            with self.subTest(url=url):
                with self.assertRaises(main.HTTPException) as ctx:
                    main.safe_fetch_url(url)
                self.assertEqual(ctx.exception.status_code, 400)

    def test_mixed_dns_answers_fail_closed(self):
        """One public + one private answer must reject the request."""

        def resolver(host, port, *args, **kwargs):
            return [
                (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (PUBLIC_IP, port)),
                (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("10.0.0.7", port)),
            ]

        with mock.patch("backend.main.socket.getaddrinfo", side_effect=resolver):
            with self.assertRaises(main.HTTPException) as ctx:
                main.safe_fetch_url(PUBLIC_URL)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_non_http_schemes_and_credentials_are_rejected(self):
        cases = {
            "file:///etc/passwd": 400,
            "ftp://news.example.com/a": 400,
            "gopher://news.example.com/": 400,
            "https://user:secret@news.example.com/": 400,
            "http:///no-host": 400,
            "not-a-url": 400,
        }
        for url, expected in cases.items():
            with self.subTest(url=url):
                with self.assertRaises(main.HTTPException) as ctx:
                    main.safe_fetch_url(url)
                self.assertEqual(ctx.exception.status_code, expected)

    def test_unresolvable_host_is_rejected(self):
        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url("http://does-not-exist.example.com/")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("could not be resolved", ctx.exception.detail)

    def test_is_blocked_ip_helper_classifies_ranges(self):
        blocked = (
            "127.0.0.1", "10.0.0.1", "172.16.5.5", "172.31.255.254", "192.168.0.1",
            "169.254.169.254", "100.100.100.200", "0.0.0.0", "224.0.0.1", "255.255.255.255",
            "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip",
        )
        allowed = ("93.184.216.34", "8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::6810:84e5")
        for ip in blocked:
            with self.subTest(ip=ip):
                self.assertTrue(main._is_blocked_ip(ip))
        for ip in allowed:
            with self.subTest(ip=ip):
                self.assertFalse(main._is_blocked_ip(ip))

    # ------------------------------------------------------------------
    # REQUIRED CASE 1: a normal public URL succeeds
    # ------------------------------------------------------------------
    def test_public_url_is_fetched_successfully(self):
        page = (
            "<html><head><title>City council approves budget</title></head><body>"
            "<p>Officials confirmed the transport programme remains on schedule and within "
            "budget, according to a statement released on Tuesday.</p></body></html>"
        )
        response = FakeResponse(
            status_code=200,
            headers={"Content-Type": "text/html; charset=utf-8"},
            chunks=[page.encode()[:60], page.encode()[60:]],
        )
        factory = self.patch_session([response])

        final_url, html = main.safe_fetch_url(PUBLIC_URL)

        self.assertEqual(final_url, PUBLIC_URL)
        self.assertIn("remains on schedule", html)
        self.assertTrue(response.closed)

        session = factory.sessions[0]
        self.assertEqual(len(session.requests), 1)
        sent = session.requests[0]
        self.assertEqual(sent["url"], PUBLIC_URL)
        self.assertIs(sent["allow_redirects"], False)      # never auto-follow
        self.assertIs(sent["stream"], True)                # streamed size cap
        self.assertEqual(sent["timeout"], config.FETCH_TIMEOUT_SECONDS)
        self.assertEqual(sent["timeout"], 10)              # required 10 s timeout
        self.assertEqual(sent["headers"]["User-Agent"], "TruthLensFetcher/1.0")
        self.assertNotIn("Mozilla", sent["headers"]["User-Agent"])
        self.assertFalse(session.trust_env)                # ignore proxy env vars
        self.assertTrue(session.closed)

    def test_endpoint_returns_headline_and_content_for_public_url(self):
        page = (
            "<html><head><title>City council approves budget</title></head><body>"
            "<p>Officials confirmed the transport programme remains on schedule and within "
            "budget, according to a statement released on Tuesday.</p></body></html>"
        )
        self.patch_session(
            [
                FakeResponse(
                    status_code=200,
                    headers={"Content-Type": "text/html"},
                    chunks=[page.encode()],
                )
            ]
        )
        result = main.fetch_news_url(schemas.NewsFetchUrlRequest(url=PUBLIC_URL))

        self.assertEqual(result["url"], PUBLIC_URL)
        self.assertEqual(result["headline"], "City council approves budget")
        self.assertIn("remains on schedule", result["content"])

    # ------------------------------------------------------------------
    # REQUIRED CASE 2: redirect to 127.0.0.1 is blocked
    # ------------------------------------------------------------------
    def test_redirect_to_loopback_is_blocked(self):
        factory = self.patch_session(
            [
                FakeResponse(
                    status_code=302,
                    headers={"Location": "http://127.0.0.1:8000/api/history"},
                )
            ]
        )

        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url("https://news.example.com/redirect")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("non-public", ctx.exception.detail)
        # the internal target must never be contacted
        self.assertEqual(len(factory.sessions[0].requests), 1)

    def test_redirect_to_cloud_metadata_is_blocked(self):
        factory = self.patch_session(
            [
                FakeResponse(
                    status_code=301,
                    headers={"Location": "http://169.254.169.254/latest/meta-data/"},
                )
            ]
        )

        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url(PUBLIC_URL)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(len(factory.sessions[0].requests), 1)

    def test_public_redirect_chain_is_followed_and_each_hop_validated(self):
        page = b"<html><body><p>" + b"Public article body text. " * 5 + b"</p></body></html>"
        factory = self.patch_session(
            [
                FakeResponse(status_code=302, headers={"Location": "https://www.example.com/final"}),
                FakeResponse(status_code=200, headers={"Content-Type": "text/html"}, chunks=[page]),
            ]
        )

        final_url, html = main.safe_fetch_url(PUBLIC_URL)

        self.assertEqual(final_url, "https://www.example.com/final")
        self.assertIn("Public article body text", html)
        self.assertEqual(len(factory.sessions[0].requests), 2)
        self.assertEqual(factory.sessions[0].requests[1]["url"], final_url)

    def test_redirect_without_location_is_rejected(self):
        self.patch_session([FakeResponse(status_code=302, headers={})])
        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url(PUBLIC_URL)
        self.assertEqual(ctx.exception.status_code, 502)

    def test_redirect_loop_is_capped(self):
        responses = [
            FakeResponse(status_code=302, headers={"Location": PUBLIC_URL})
            for _ in range(config.FETCH_MAX_REDIRECTS + 3)
        ]
        factory = self.patch_session(responses)

        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url(PUBLIC_URL)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("redirected more than", ctx.exception.detail)
        self.assertEqual(len(factory.sessions[0].requests), config.FETCH_MAX_REDIRECTS + 1)

    # ------------------------------------------------------------------
    # REQUIRED CASE 3: a huge HTML page (> 2 MB) is blocked
    # ------------------------------------------------------------------
    def test_huge_page_is_rejected_with_413(self):
        megabyte = b"x" * (1024 * 1024)
        response = FakeResponse(
            status_code=200,
            headers={"Content-Type": "text/html"},
            chunks=[megabyte, megabyte, megabyte],  # ~3 MB, above the 2 MB cap
        )
        self.patch_session([response])

        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url(PUBLIC_URL)

        self.assertEqual(ctx.exception.status_code, 413)
        self.assertIn("2 MB", ctx.exception.detail)
        self.assertTrue(response.closed)  # stream closed, connection released
        self.assertGreater(3 * 1024 * 1024, config.FETCH_MAX_BYTES)

    def test_oversized_content_length_is_rejected_with_413_before_download(self):
        response = FakeResponse(
            status_code=200,
            headers={"Content-Type": "text/html", "Content-Length": str(8 * 1024 * 1024)},
            chunks=[b"<html>must not be read</html>"],
        )
        self.patch_session([response])

        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url(PUBLIC_URL)

        self.assertEqual(ctx.exception.status_code, 413)
        self.assertTrue(response.closed)

    def test_endpoint_propagates_413_for_oversized_page(self):
        megabyte = b"y" * (1024 * 1024)
        self.patch_session(
            [
                FakeResponse(
                    status_code=200,
                    headers={"Content-Type": "text/html"},
                    chunks=[megabyte, megabyte, megabyte],
                )
            ]
        )
        with self.assertRaises(main.HTTPException) as ctx:
            main.fetch_news_url(schemas.NewsFetchUrlRequest(url=PUBLIC_URL))
        self.assertEqual(ctx.exception.status_code, 413)

    def test_page_just_under_the_cap_is_accepted(self):
        padding = b"<html><body><p></p></body></html>"  # 32 bytes of markup
        page = padding + b"z" * (config.FETCH_MAX_BYTES - len(padding))
        self.assertEqual(len(page), config.FETCH_MAX_BYTES)
        self.patch_session(
            [FakeResponse(status_code=200, headers={"Content-Type": "text/html"}, chunks=[page])]
        )
        _, html = main.safe_fetch_url(PUBLIC_URL)
        self.assertEqual(len(html), len(page))

    # ------------------------------------------------------------------
    # Response handling
    # ------------------------------------------------------------------
    def test_non_html_content_is_rejected(self):
        self.patch_session(
            [
                FakeResponse(
                    status_code=200,
                    headers={"Content-Type": "application/pdf"},
                    chunks=[b"%PDF-1.7"],
                )
            ]
        )
        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url(PUBLIC_URL)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("HTML article page", ctx.exception.detail)

    def test_upstream_error_status_is_reported_as_502(self):
        self.patch_session([FakeResponse(status_code=503, headers={"Content-Type": "text/html"})])
        with self.assertRaises(main.HTTPException) as ctx:
            main.safe_fetch_url(PUBLIC_URL)
        self.assertEqual(ctx.exception.status_code, 502)

    def test_timeout_is_reported_as_504(self):
        class TimeoutSession(FakeSession):
            def get(self, url, **kwargs):
                raise main._requests.exceptions.Timeout("too slow")

        with mock.patch("backend.main._requests.Session", lambda: TimeoutSession([])):
            with self.assertRaises(main.HTTPException) as ctx:
                main.safe_fetch_url(PUBLIC_URL)
        self.assertEqual(ctx.exception.status_code, 504)

    def test_connection_error_is_reported_as_502(self):
        class BrokenSession(FakeSession):
            def get(self, url, **kwargs):
                raise main._requests.exceptions.ConnectionError("refused")

        with mock.patch("backend.main._requests.Session", lambda: BrokenSession([])):
            with self.assertRaises(main.HTTPException) as ctx:
                main.safe_fetch_url(PUBLIC_URL)
        self.assertEqual(ctx.exception.status_code, 502)


class RateLimitMiddlewareTests(unittest.TestCase):
    """`rate_limit_article_fetch` only throttles POST /api/news/fetch-url."""

    def setUp(self) -> None:
        self.limiter = main._SlidingWindowRateLimiter(max_requests=3, window_seconds=60)
        patched = mock.patch("backend.main._fetch_limiter", self.limiter)
        patched.start()
        self.addCleanup(patched.stop)

    def test_fetch_endpoint_is_rate_limited_with_429_and_retry_after(self):
        async def run():
            request = make_request()
            statuses, retry_after = [], None
            for _ in range(4):
                response = await main.rate_limit_article_fetch(request, _next_ok)
                statuses.append(response.status_code)
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
            return statuses, retry_after

        statuses, retry_after = asyncio.run(run())

        self.assertEqual(statuses, [200, 200, 200, 429])
        self.assertIsNotNone(retry_after)
        self.assertGreaterEqual(int(retry_after), 1)

    def test_other_routes_are_not_rate_limited(self):
        async def run():
            request = make_request(path="/api/stats", method="GET")
            return [
                (await main.rate_limit_article_fetch(request, _next_ok)).status_code
                for _ in range(12)
            ]

        self.assertEqual(set(asyncio.run(run())), {200})

    def test_limiter_is_per_client_key(self):
        limiter = main._SlidingWindowRateLimiter(1, 60)
        self.assertTrue(limiter.check("198.51.100.9")[0])
        self.assertFalse(limiter.check("198.51.100.9")[0])
        self.assertTrue(limiter.check("198.51.100.10")[0])

    def test_limiter_window_expires(self):
        # the limiter clamps its window to a 0.1 s minimum, so use a matching window
        limiter = main._SlidingWindowRateLimiter(2, 0.1)
        self.assertTrue(limiter.check("k")[0])
        self.assertTrue(limiter.check("k")[0])
        allowed, retry_after = limiter.check("k")
        self.assertFalse(allowed)
        self.assertGreater(retry_after, 0)
        time.sleep(0.2)
        self.assertTrue(limiter.check("k")[0])


if __name__ == "__main__":  # pragma: no cover
    unittest.main(verbosity=2)
