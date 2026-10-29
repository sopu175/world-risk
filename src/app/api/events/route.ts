import { db } from "@/lib/db";
import { ok, fail, zodFail } from "@/lib/api-utils";
import { eventsQuerySchema } from "@/lib/validation";
import { parseBbox } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = eventsQuerySchema.safeParse({
      type: url.searchParams.get("type") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      bbox: url.searchParams.get("bbox") ?? undefined,
      days: url.searchParams.get("days") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!q.success) return zodFail(q.error);
    const { type, kind, bbox: bboxStr, days, limit } = q.data;

    const bbox = parseBbox(bboxStr ?? null);
    if (bboxStr && !bbox) return fail("validation_error", "bbox must be west,south,east,north in valid ranges", 400);

    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const where: Parameters<typeof db.disasterEvent.findMany>[0]["where"] = {
      startDate: { gte: since },
    };
    if (type !== "all") where.eventType = type;
    if (kind !== "all") where.kind = kind;
    if (bbox) {
      where.lat = { gte: bbox.south, lte: bbox.north, not: null };
      where.lng = bbox.west <= bbox.east ? { gte: bbox.west, lte: bbox.east, not: null } : { gte: bbox.west, not: null };
    }

    const rows = await db.disasterEvent.findMany({
      where,
      orderBy: { startDate: "desc" },
      take: limit,
    });

    return ok({
      events: rows.map((r) => ({
        id: r.id,
        externalId: r.externalId,
        title: r.title,
        eventType: r.eventType,
        kind: r.kind,
        lat: r.lat,
        lng: r.lng,
        placeName: r.placeName,
        countryName: r.countryName,
        countryCode: r.countryCode,
        startDate: r.startDate?.toISOString() ?? null,
        endDate: r.endDate?.toISOString() ?? null,
        severityLabel: r.severityLabel,
        severityValue: r.severityValue,
        severityUnit: r.severityUnit,
        sourceName: r.sourceName,
        sourceUrl: r.sourceUrl,
        sourcePublishedAt: r.sourcePublishedAt?.toISOString() ?? null,
        verificationStatus: r.verificationStatus,
        summary: r.summary,
      })),
      meta: {
        count: rows.length,
        truncated: rows.length >= limit,
        windowDays: days,
      },
    });
  } catch (err) {
    return fail("events_error", err instanceof Error ? err.message : "Failed to load events", 500);
  }
}
