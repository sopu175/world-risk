#!/usr/bin/env python3
"""
WorldRisk Atlas — scheduled ingestion worker.

A minimal, dependency-free (stdlib only) scheduler that periodically triggers
the platform's ingestion pipeline through the admin REST endpoint. All
ingestion logic (schema validation, dedup, retries, audit logging, auto-disable)
lives server-side; this worker only:

  1. polls on a fixed interval (default 60 min),
  2. POSTs /api/admin/ingest with an optional ADMIN_TOKEN header,
  3. logs every outcome to stdout and a rotating log file,
  4. retries transient HTTP/network failures with exponential backoff.

Production replacement: a proper queue/worker (e.g. Celery beat, systemd timer,
or Kubernetes CronJob) calling the same endpoint — the contract is identical.

Usage:
    python3 workers/ingest-worker.py                     # every 60 min, all bulk sources
    INGEST_INTERVAL_MIN=15 python3 workers/ingest-worker.py
    ADMIN_TOKEN=secret INGEST_BASE_URL=http://localhost:3000 python3 workers/ingest-worker.py
"""

from __future__ import annotations

import json
import os
import signal
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = os.environ.get("INGEST_BASE_URL", "http://localhost:3000").rstrip("/")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
INTERVAL_MIN = float(os.environ.get("INGEST_INTERVAL_MIN", "60"))
SOURCES = [s for s in os.environ.get("INGEST_SOURCES", "").split(",") if s]
LOG_FILE = Path(os.environ.get("INGEST_LOG_FILE", "workers/ingest-worker.log"))
MAX_RETRIES = int(os.environ.get("INGEST_MAX_RETRIES", "3"))
TIMEOUT_S = int(os.environ.get("INGEST_TIMEOUT_S", "180"))

_running = True


def _stop(signum, _frame):
    global _running
    _running = False
    log(f"received signal {signum} — shutting down after current cycle")


signal.signal(signal.SIGTERM, _stop)
signal.signal(signal.SIGINT, _stop)


def log(msg: str) -> None:
    line = f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}"
    print(line, flush=True)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def post_ingest() -> dict:
    """Trigger one ingestion cycle. Returns the parsed outcome payload."""
    payload: dict = {"trigger": "scheduled"}
    if SOURCES:
        payload["sources"] = SOURCES
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/api/admin/ingest",
        data=body,
        headers={"Content-Type": "application/json", **({"x-admin-token": ADMIN_TOKEN} if ADMIN_TOKEN else {})},
        method="POST",
    )
    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            last_err = RuntimeError(f"HTTP {e.code}: {detail}")
            if 400 <= e.code < 500 and e.code != 429:
                break  # client errors will not heal by retrying
        except Exception as e:  # noqa: BLE001 — worker must never crash
            last_err = e
        if attempt < MAX_RETRIES:
            backoff = 2 ** (attempt - 1) * 5
            log(f"attempt {attempt} failed ({last_err}); retrying in {backoff}s")
            time.sleep(backoff)
    raise RuntimeError(f"ingest trigger failed after {MAX_RETRIES} attempts: {last_err}")


def run_cycle() -> None:
    log("scheduled ingestion cycle starting")
    try:
        payload = post_ingest()
        for outcome in payload.get("data", {}).get("outcomes", []):
            status = outcome.get("status", "?")
            key = outcome.get("sourceKey", "?")
            if status in ("success", "partial"):
                log(
                    f"{key}: {status} — fetched={outcome.get('recordsFetched')} "
                    f"inserted={outcome.get('recordsInserted')} updated={outcome.get('recordsUpdated')} "
                    f"skipped={outcome.get('recordsSkipped')} invalid={outcome.get('recordsInvalid')} "
                    f"({outcome.get('durationMs')} ms)"
                )
            else:
                log(f"{key}: {status} — {outcome.get('reason')}")
    except Exception as e:  # noqa: BLE001
        log(f"cycle FAILED: {e}")
    else:
        log("cycle complete")


def main() -> int:
    log(
        f"WorldRisk Atlas ingest worker starting — base={BASE_URL} interval={INTERVAL_MIN}min "
        f"sources={SOURCES or 'all-eligible'} auth={'token' if ADMIN_TOKEN else 'open'}"
    )
    # Run once immediately, then on the fixed interval (aligned to wall clock).
    run_cycle()
    while _running:
        deadline = time.monotonic() + INTERVAL_MIN * 60
        while _running and time.monotonic() < deadline:
            time.sleep(min(5, max(0.5, deadline - time.monotonic())))
        if _running:
            run_cycle()
    log("worker stopped cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
