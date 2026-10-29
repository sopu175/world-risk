import { ok } from "@/lib/api-utils";
import { ensureBootstrapped } from "@/lib/ingest/bootstrap";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Idempotent first-run ingestion. Safe to call repeatedly — it only imports
 * when no ingestion run has ever completed, and only touches sources whose
 * configuration (API keys, adapters) is valid.
 */
export async function POST() {
  await ensureBootstrapped();
  return ok({ bootstrapped: true });
}
