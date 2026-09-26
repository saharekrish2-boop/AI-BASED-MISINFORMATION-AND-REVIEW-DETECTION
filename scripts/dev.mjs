#!/usr/bin/env node
// Launches the TruthLens FastAPI backend and the static frontend dev server
// side-by-side. Uses only Node built-ins so no `npm install` is required.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const python = process.env.PYTHON || "python";

const targets = [
    {
        name: "api",
        color: "\x1b[36m",
        command: python,
        args: [
            "-m", "uvicorn", "backend.main:app",
            "--reload",
            "--host", "127.0.0.1",
            "--port", process.env.API_PORT || "8765",
        ],
    },
    {
        name: "web",
        color: "\x1b[32m",
        command: python,
        args: [
            "-m", "http.server", process.env.WEB_PORT || "5173",
            "--bind", "127.0.0.1",
            "--directory", "frontend",
        ],
    },
];

const children = [];
let shuttingDown = false;

const label = target => `${target.color}[${target.name}]\x1b[0m`;

const pipeOutput = (child, target) => {
    let pending = { stdout: "", stderr: "" };
    const forward = (stream, chunk) => {
        pending[stream] += chunk.toString("utf8");
        const parts = pending[stream].split(/\r?\n/);
        pending[stream] = parts.pop() ?? "";
        for (const line of parts) {
            if (line.length) process.stdout.write(`${label(target)} ${line}\n`);
        }
    };
    child.stdout.on("data", chunk => forward("stdout", chunk));
    child.stderr.on("data", chunk => forward("stderr", chunk));
};

const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
        if (child.exitCode !== null || child.signalCode !== null) continue;
        if (process.platform === "win32") {
            // uvicorn's --reload spawns a worker on Windows; SIGTERM only kills
            // the parent, leaving the child bound to the API port.
            spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
        } else {
            child.kill("SIGTERM");
        }
    }
    setTimeout(() => process.exit(code), 250);
};

for (const target of targets) {
    const child = spawn(target.command, target.args, {
        cwd: projectRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
    });

    child.on("error", error => {
        process.stderr.write(
            `${label(target)} failed to start: ${error.message}\n` +
            `${label(target)} is the command runnable? Try setting PYTHON=/path/to/python.\n`
        );
        shutdown(1);
    });

    child.on("exit", (code, signal) => {
        process.stdout.write(`${label(target)} exited (code=${code ?? "null"} signal=${signal ?? "none"})\n`);
        shutdown(code ?? 0);
    });

    pipeOutput(child, target);
    children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const apiPort = process.env.API_PORT || "8765";
const webPort = process.env.WEB_PORT || "5173";
process.stdout.write(
    `\x1b[35m[dev]\x1b[0m frontend → http://127.0.0.1:${webPort}   ` +
    `api → http://127.0.0.1:${apiPort}   docs → http://127.0.0.1:${apiPort}/docs\n`
);
