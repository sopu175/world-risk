import { db } from "@/lib/db";
import { ok, fail, zodFail, readJson } from "@/lib/api-utils";
import { correctionBodySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const parsed = correctionBodySchema.safeParse(body);
    if (!parsed.success) return zodFail(parsed.error);

    const correction = await db.correction.create({
      data: {
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId ?? null,
        targetLabel: parsed.data.targetLabel ?? null,
        field: parsed.data.field ?? null,
        proposedValue: parsed.data.proposedValue ?? null,
        message: parsed.data.message,
        submitterEmail: parsed.data.submitterEmail ? parsed.data.submitterEmail : null,
      },
    });

    return ok(
      {
        id: correction.id,
        status: correction.status,
        createdAt: correction.createdAt.toISOString(),
        message: "Correction submitted — it will be reviewed by a data steward.",
      },
      { status: 201 },
    );
  } catch (err) {
    return fail("correction_error", err instanceof Error ? err.message : "Failed to submit correction", 500);
  }
}
