import { ok, fail, zodFail, readJson } from "@/lib/api-utils";
import { ingestRunBodySchema } from "@/lib/validation";
import { runIngestion } from "@/lib/ingest/runner";
import { checkAdminAuth } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Scheduled ingestion trigger — the endpoint used by workers/ingest-worker.py
 * and external cron systems. The in-app scheduler (src/instrumentation.ts)
 * does the same work in-process, so calling this is only needed when
 * INGEST_SCHEDULER=0.
 *
 * Open by default (self-hosted deployments); when ADMIN_TOKEN is configured,
 * the request must carry the matching `x-admin-token` header.
 */
export async function POST(req: Request) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return fail("unauthorized", auth.reason ?? "Unauthorized", 401);

  try {
    const body = await readJson(req);
    const parsed = ingestRunBodySchema.safeParse(body ?? {});
    if (!parsed.success) return zodFail(parsed.error);

    const outcomes = await runIngestion(parsed.data.sources, parsed.data.trigger);
    return ok({ outcomes });
  } catch (err) {
    return fail("ingest_error", err instanceof Error ? err.message : "Ingestion failed", 500);
  }
}
