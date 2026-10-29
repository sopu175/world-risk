import { db } from "@/lib/db";
import { ok, fail, zodFail, readJson } from "@/lib/api-utils";
import { adminCorrectionPatchSchema } from "@/lib/validation";
import { checkAdminAuth } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return fail("unauthorized", auth.reason ?? "Unauthorized", 401);

  try {
    const body = await readJson(req);
    const parsed = adminCorrectionPatchSchema.safeParse(body);
    if (!parsed.success) return zodFail(parsed.error);

    const updated = await db.correction.update({
      where: { id: parsed.data.id },
      data: {
        status: parsed.data.status,
        adminNote: parsed.data.adminNote ?? null,
        resolvedAt: parsed.data.status === "open" ? null : new Date(),
      },
    });

    return ok({ id: updated.id, status: updated.status, adminNote: updated.adminNote });
  } catch (err) {
    return fail("correction_update_error", err instanceof Error ? err.message : "Failed to update correction", 500);
  }
}
