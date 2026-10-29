import { ok, fail, zodFail, readJson } from "@/lib/api-utils";
import { adminIngestBodySchema } from "@/lib/validation";
import { runIngestion } from "@/lib/ingest/runner";
import { checkAdminAuth } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return fail("unauthorized", auth.reason ?? "Unauthorized", 401);

  try {
    const body = await readJson(req);
    const parsed = adminIngestBodySchema.safeParse(body ?? {});
    if (!parsed.success) return zodFail(parsed.error);

    const outcomes = await runIngestion(parsed.data.sources, parsed.data.trigger);
    return ok({ outcomes });
  } catch (err) {
    return fail("ingest_error", err instanceof Error ? err.message : "Ingestion failed", 500);
  }
}
