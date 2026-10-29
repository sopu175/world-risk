import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

/**
 * Public, read-only ingestion audit trail — part of the project's
 * transparency promise: every import (fetched / inserted / updated / skipped /
 * invalid counts, dataset version, duration, errors) is inspectable here.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    const runs = await db.ingestionRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { source: { select: { key: true, name: true } } },
    });
    return ok({
      runs: runs.map((r) => ({
        id: r.id,
        sourceKey: r.source.key,
        sourceName: r.source.name,
        status: r.status,
        trigger: r.trigger,
        attempt: r.attempt,
        recordsFetched: r.recordsFetched,
        recordsInserted: r.recordsInserted,
        recordsUpdated: r.recordsUpdated,
        recordsSkipped: r.recordsSkipped,
        recordsInvalid: r.recordsInvalid,
        datasetVersion: r.datasetVersion,
        errorMessage: r.errorMessage,
        durationMs: r.durationMs,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return fail("runs_error", err instanceof Error ? err.message : "Failed to load runs", 500);
  }
}
