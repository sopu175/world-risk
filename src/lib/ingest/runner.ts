// Ingestion orchestrator.
//
// Guarantees:
//  - every attempt produces an IngestionRun audit row (status, counts, error)
//  - network-level retries happen inside fetchJsonSafe; failures are recorded
//  - repeated failures flip the source to auto_disabled after a threshold
//    (administrators can re-enable manually)
//  - existing valid data is never deleted or overwritten by failed imports
//  - one source runs at most once concurrently; sources run sequentially to
//    stay friendly to the SQLite write lock

import { db } from "@/lib/db";
import { SOURCE_DEFS, SOURCE_DEF_BY_KEY } from "@/lib/ingest/sources";
import type { RunStatus } from "@/lib/types";

const AUTO_DISABLE_THRESHOLD = 5;
const activeRuns = new Set<string>();

export type RunOutcome = {
  sourceKey: string;
  runId: string | null;
  status: "success" | "partial" | "failed" | "skipped" | "running";
  reason: string | null;
  recordsFetched?: number;
  recordsInserted?: number;
  recordsUpdated?: number;
  recordsSkipped?: number;
  recordsInvalid?: number;
  datasetVersion?: string | null;
  durationMs?: number | null;
};

function sourceEnvKeyPresent(def: (typeof SOURCE_DEFS)[number]): boolean {
  if (!def.requiresApiKeyEnv) return true;
  const v = process.env[def.requiresApiKeyEnv];
  return Boolean(v && v.trim().length > 0);
}

export function computeSeedStatus(def: (typeof SOURCE_DEFS)[number]): {
  status: string;
  statusReason: string | null;
  apiKeyPresent: boolean;
} {
  const apiKeyPresent = def.requiresApiKeyEnv
    ? Boolean(process.env[def.requiresApiKeyEnv]?.trim())
    : false;
  if (def.requiresApiKeyEnv && !apiKeyPresent) {
    return {
      status: "needs_config",
      statusReason: `Requires the ${def.requiresApiKeyEnv} environment variable (free registration with the provider).`,
      apiKeyPresent,
    };
  }
  if (def.accessMode === "bulk" && !def.ingest) {
    return {
      status: "needs_config",
      statusReason: "Ingestion adapter is pending validation — no data is loaded until then.",
      apiKeyPresent,
    };
  }
  return { status: "active", statusReason: null, apiKeyPresent };
}

export async function runIngestionForSource(sourceKey: string, trigger: string): Promise<RunOutcome> {
  const def = SOURCE_DEF_BY_KEY.get(sourceKey);
  if (!def) return { sourceKey, runId: null, status: "skipped", reason: "Unknown source key" };
  if (def.accessMode !== "bulk" || !def.ingest) {
    return { sourceKey, runId: null, status: "skipped", reason: "On-demand source — nothing to bulk-ingest" };
  }
  if (!sourceEnvKeyPresent(def)) {
    return { sourceKey, runId: null, status: "skipped", reason: `Missing ${def.requiresApiKeyEnv}` };
  }

  const source = await db.dataSource.findUnique({ where: { key: sourceKey } });
  if (!source) return { sourceKey, runId: null, status: "skipped", reason: "Source not seeded" };
  if (!source.enabled) return { sourceKey, runId: null, status: "skipped", reason: "Disabled by administrator" };
  if (activeRuns.has(sourceKey)) {
    return { sourceKey, runId: null, status: "skipped", reason: "A run for this source is already in progress" };
  }

  activeRuns.add(sourceKey);
  const logs: string[] = [];
  const startedAt = Date.now();

  const run = await db.ingestionRun.create({
    data: {
      sourceId: source.id,
      status: "running",
      trigger,
      attempt: source.consecutiveFailures + 1,
    },
  });

  try {
    await db.dataSource.update({ where: { id: source.id }, data: { lastAttemptAt: new Date() } });
    const result = await def.ingest({
      sourceId: source.id,
      log: (msg) => {
        logs.push(msg);
      },
    });

    const touched = result.recordsInserted + result.recordsUpdated;
    const status: RunStatus = result.recordsInvalid > 0 && touched > 0 ? "partial" : "success";
    const durationMs = Date.now() - startedAt;

    await db.ingestionRun.update({
      where: { id: run.id },
      data: {
        status,
        recordsFetched: result.recordsFetched,
        recordsInserted: result.recordsInserted,
        recordsUpdated: result.recordsUpdated,
        recordsSkipped: result.recordsSkipped,
        recordsInvalid: result.recordsInvalid,
        datasetVersion: result.datasetVersion,
        durationMs,
        finishedAt: new Date(),
        errorMessage: logs.length ? logs.slice(-3).join(" | ") : null,
      },
    });

    await db.dataSource.update({
      where: { id: source.id },
      data: {
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        status: "active",
        statusReason: null,
      },
    });

    return {
      sourceKey,
      runId: run.id,
      status,
      reason: null,
      ...result,
      durationMs,
    };
  } catch (err) {
    const failures = source.consecutiveFailures + 1;
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    const autoDisabled = failures >= AUTO_DISABLE_THRESHOLD;

    await db.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorMessage: message,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date(),
      },
    });

    await db.dataSource.update({
      where: { id: source.id },
      data: {
        consecutiveFailures: failures,
        lastAttemptAt: new Date(),
        status: autoDisabled ? "auto_disabled" : source.status === "needs_config" ? "needs_config" : "failed",
        statusReason: autoDisabled
          ? `Auto-disabled after ${failures} consecutive failed imports. Last error: ${message.slice(0, 200)}`
          : message.slice(0, 300),
      },
    });

    return {
      sourceKey,
      runId: run.id,
      status: "failed",
      reason: message,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    activeRuns.delete(sourceKey);
  }
}

export async function runIngestion(sourceKeys: string[] | undefined, trigger: string): Promise<RunOutcome[]> {
  const keys =
    sourceKeys && sourceKeys.length > 0
      ? sourceKeys
      : SOURCE_DEFS.filter((s) => s.accessMode === "bulk").map((s) => s.key);
  const outcomes: RunOutcome[] = [];
  for (const key of keys) {
    outcomes.push(await runIngestionForSource(key, trigger));
  }
  return outcomes;
}
