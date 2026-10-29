import { db } from "@/lib/db";
import { ok, fail, zodFail, readJson } from "@/lib/api-utils";
import { savedLocationBodySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Saved locations — anonymous-session scope in the free tier MVP.
 * This is the monetization-ready extension point: premium tiers will attach
 * these to user accounts (NextAuth) and add alert subscriptions. See docs.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId || sessionId.length < 8) return fail("validation_error", "sessionId required", 400);
    const rows = await db.savedLocation.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ savedLocations: rows });
  } catch (err) {
    return fail("saved_locations_error", err instanceof Error ? err.message : "Failed to load saved locations", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const parsed = savedLocationBodySchema.safeParse(body);
    if (!parsed.success) return zodFail(parsed.error);
    const saved = await db.savedLocation.create({ data: parsed.data });
    return ok({ savedLocation: saved }, { status: 201 });
  } catch (err) {
    return fail("saved_location_error", err instanceof Error ? err.message : "Failed to save location", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const sessionId = url.searchParams.get("sessionId");
    if (!id || !sessionId) return fail("validation_error", "id and sessionId required", 400);
    const existing = await db.savedLocation.findUnique({ where: { id } });
    if (!existing || existing.sessionId !== sessionId) return fail("not_found", "Saved location not found", 404);
    await db.savedLocation.delete({ where: { id } });
    return ok({ deleted: id });
  } catch (err) {
    return fail("saved_location_error", err instanceof Error ? err.message : "Failed to delete saved location", 500);
  }
}
