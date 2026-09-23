/**
 * Backend entry point for `npm run dev`.
 *
 * The application logic lives in the FastAPI app (backend/main.py). This
 * script starts that server and exposes it to clients:
 *   1. Loads backend/.env via dotenv (PORT, INTERNAL_PORT, GROQ_* ...).
 *   2. Spawns uvicorn serving backend.main:app on 127.0.0.1:INTERNAL_PORT.
 *   3. Runs an Express gateway on 0.0.0.0:PORT (default 8000 — the URL the
 *      frontend already calls) and forwards every request to the FastAPI
 *      process with axios, streaming responses (including CORS headers)
 *      back verbatim.
 *
 * Why a gateway: the public contract of the app (port, paths, CORS) stays
 * exactly as the frontend/tests expect, while npm owns the process lifecycle.
 */
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { spawn } = require("child_process");
const path = require("path");
const express = require("express");
const axios = require("axios");

const PORT = Number(process.env.PORT || 8000);
const INTERNAL_PORT = Number(process.env.INTERNAL_PORT || 8001);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const INTERNAL_BASE = `http://127.0.0.1:${INTERNAL_PORT}`;

// ---------------------------------------------------------------------------
// 1. Spawn the FastAPI backend (uvicorn) on the internal port.
// ---------------------------------------------------------------------------
const serverProc = spawn(
  "python",
  [
    "-m",
    "uvicorn",
    "backend.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    String(INTERNAL_PORT),
    "--log-level",
    "info",
  ],
  { cwd: PROJECT_ROOT, stdio: ["ignore", "inherit", "inherit"] }
);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (serverProc && serverProc.exitCode === null) serverProc.kill();
  } catch (_) {
    /* ignore */
  }
  process.exit(code);
}
serverProc.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`[index] backend process exited (code=${code} signal=${signal})`);
    shutdown(code === 0 ? 0 : 1);
  }
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ---------------------------------------------------------------------------
// 2. Express gateway: proxy every request to the FastAPI process via axios.
// ---------------------------------------------------------------------------
const app = express();
const client = axios.create({
  baseURL: INTERNAL_BASE,
  maxRedirects: 0, // report redirects to the caller instead of following them
  validateStatus: () => true, // pass any status through to the client
  responseType: "stream",
  timeout: 120000,
});

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

app.use(async (req, res) => {
  try {
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const body = hasBody ? await readRawBody(req) : undefined;

    const upstream = await client.request({
      method: req.method,
      url: req.originalUrl,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${INTERNAL_PORT}`,
        "content-length": hasBody && body ? String(body.length) : undefined,
      },
      data: hasBody && body.length ? body : undefined,
    });

    // Stream the response back, copying headers (incl. CORS) verbatim.
    const headers = { ...upstream.headers };
    delete headers["transfer-encoding"];
    delete headers.connection;
    res.writeHead(upstream.status, headers);
    if (req.method === "HEAD" || !upstream.data.pipe) {
      res.end();
    } else {
      upstream.data.pipe(res);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(503).json({
        detail: "Backend is starting up or unreachable — retry shortly.",
        error: String(err.message || err),
      });
    } else {
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Wait until FastAPI is healthy, then announce readiness.
// ---------------------------------------------------------------------------
const startedAt = Date.now();
const healthTimer = setInterval(async () => {
  try {
    const r = await axios.get(`${INTERNAL_BASE}/api/health`, { timeout: 2000 });
    if (r.status === 200) {
      clearInterval(healthTimer);
      console.log(
        `[index] backend ready in ${((Date.now() - startedAt) / 1000).toFixed(1)}s ` +
          `-> http://127.0.0.1:${PORT} (fastapi on ${INTERNAL_PORT})`
      );
    }
  } catch (_) {
    /* not ready yet */
  }
  if (Date.now() - startedAt > 60000) {
    clearInterval(healthTimer);
    console.error("[index] backend did not become healthy within 60s");
    shutdown(1);
  }
}, 500);

app.listen(PORT, () => {
  console.log(`[index] gateway listening on http://0.0.0.0:${PORT}`);
});