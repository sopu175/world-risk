// Next.js instrumentation hook — runs once per server process on startup.
// Used to start the automatic ingestion scheduler (see src/lib/ingest/scheduler.ts).
// Disable with INGEST_SCHEDULER=0 (e.g. when running workers/ingest-worker.py or cron instead).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startIngestScheduler } = await import("@/lib/ingest/scheduler");
  startIngestScheduler();
}
