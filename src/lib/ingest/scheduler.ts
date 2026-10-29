// Self-contained ingestion scheduler.
//
// Started once per server process from src/instrumentation.ts. Keeps the
// atlas automatically up to date without any admin UI or external cron:
//
//   - shortly after boot it bootstraps (seed + first import for eligible
//     bulk sources) if the database is fresh;
//   - every TICK_MINUTES it imports every bulk source whose cadence window
//     (cadenceHours in the registry) has elapsed since its last successful
//     import — USGS every 3 h, NASA EONET every 6 h;
//   - the runner guarantees: schema validation, dedup, upsert-only writes,
//     full audit trail, jittered retries, auto-pause after 5 consecutive
//     failures (the source reports "unavailable" with the reason until it
//     recovers — no admin action needed).
//
// Operators who prefer external orchestration can disable this with
// INGEST_SCHEDULER=0 and run workers/ingest-worker.py (same contract) or a
// cron hitting POST /api/ingest/run instead.

import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/ingest/bootstrap";
import { runIngestion } from "@/lib/ingest/runner";

const TICK_MINUTES = 15;
const FIRST_TICK_MS = 8_000;

function log(msg: string): void {
  console.log(`[ingest-scheduler] ${new Date().toISOString()} ${msg}`);
}

async function tick(): Promise<void> {
  await ensureSeed();

  const sources = await db.dataSource.findMany({
    where: { accessMode: "bulk", enabled: true },
    select: { key: true, cadenceHours: true, lastSuccessAt: true, lastAttemptAt: true, status: true },
  });

  const now = Date.now();
  const due = sources.filter((s) => {
    if (s.status === "needs_config") return false;
    const lastSuccess = s.lastSuccessAt?.getTime() ?? 0;
    const lastAttempt = s.lastAttemptAt?.getTime() ?? 0;
    const reference = Math.max(lastSuccess, lastAttempt);
    // never attempted → due immediately (first import); otherwise respect cadence
    return reference === 0 || now - reference >= s.cadenceHours * 3600_000;
  });

  if (due.length === 0) {
    log(`tick: all sources within their cadence window (${sources.length} monitored)`);
    return;
  }

  log(`tick: importing ${due.length} due source(s): ${due.map((s) => s.key).join(", ")}`);
  const outcomes = await runIngestion(
    due.map((s) => s.key),
    "scheduled",
  );
  for (const o of outcomes) {
    if (o.status === "success" || o.status === "partial") {
      log(
        `${o.sourceKey}: ${o.status} — fetched=${o.recordsFetched} inserted=${o.recordsInserted} updated=${o.recordsUpdated} skipped=${o.recordsSkipped} invalid=${o.recordsInvalid} (${o.durationMs ?? 0} ms)`,
      );
    } else {
      log(`${o.sourceKey}: ${o.status}${o.reason ? ` — ${o.reason}` : ""}`);
    }
  }
}

const globalForScheduler = globalThis as unknown as {
  __wraSchedulerStarted?: boolean;
};

export function startIngestScheduler(): void {
  if (process.env.INGEST_SCHEDULER === "0") {
    log("disabled via INGEST_SCHEDULER=0 — skipping");
    return;
  }
  if (globalForScheduler.__wraSchedulerStarted) return;
  globalForScheduler.__wraSchedulerStarted = true;

  log(`starting (tick every ${TICK_MINUTES} min, cadence-driven per source)`);

  const loop = async () => {
    for (;;) {
      const startedAt = Date.now();
      try {
        await tick();
      } catch (err) {
        log(`tick error: ${err instanceof Error ? err.message : String(err)}`);
      }
      const elapsed = Date.now() - startedAt;
      await new Promise((r) => setTimeout(r, Math.max(1_000, TICK_MINUTES * 60_000 - elapsed)));
    }
  };

  setTimeout(() => {
    void loop();
  }, FIRST_TICK_MS).unref?.();
}
