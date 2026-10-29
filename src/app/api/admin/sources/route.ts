import { db } from "@/lib/db";
import { ok, fail, zodFail, readJson } from "@/lib/api-utils";
import { adminSourcePatchSchema } from "@/lib/validation";
import { checkAdminAuth } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return fail("unauthorized", auth.reason ?? "Unauthorized", 401);

  try {
    const body = await readJson(req);
    const parsed = adminSourcePatchSchema.safeParse(body);
    if (!parsed.success) return zodFail(parsed.error);
    const { key, enabled, notes } = parsed.data;

    const existing = await db.dataSource.findUnique({ where: { key } });
    if (!existing) return fail("not_found", `Unknown data source: ${key}`, 404);

    const data: { enabled?: boolean; status?: string; statusReason?: string | null; consecutiveFailures?: number; notes?: string | null } = {};
    if (enabled !== undefined) {
      if (enabled) {
        const envKeyStillMissing = existing.requiresApiKeyEnv && !process.env[existing.requiresApiKeyEnv]?.trim();
        data.enabled = true;
        data.status = envKeyStillMissing ? "needs_config" : "active";
        data.statusReason = envKeyStillMissing
          ? `Re-enabled, but ${existing.requiresApiKeyEnv} is still not configured.`
          : null;
        data.consecutiveFailures = 0;
      } else {
        data.enabled = false;
        data.status = "disabled";
        data.statusReason = "Disabled by administrator.";
      }
    }
    if (notes !== undefined) data.notes = notes;

    const updated = await db.dataSource.update({ where: { key }, data });
    return ok({
      key: updated.key,
      enabled: updated.enabled,
      status: updated.status,
      statusReason: updated.statusReason,
    });
  } catch (err) {
    return fail("admin_source_error", err instanceof Error ? err.message : "Failed to update source", 500);
  }
}
