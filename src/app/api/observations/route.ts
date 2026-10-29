import { db } from "@/lib/db";
import { ok, fail, zodFail } from "@/lib/api-utils";
import { observationsQuerySchema } from "@/lib/validation";
import { parseBbox } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = observationsQuerySchema.safeParse({
      layer: url.searchParams.get("layer") ?? undefined,
      bbox: url.searchParams.get("bbox") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      minMagnitude: url.searchParams.get("minMagnitude") ?? undefined,
    });
    if (!q.success) return zodFail(q.error);
    const { layer, bbox: bboxStr, limit, minMagnitude } = q.data;

    // Currently only the earthquake layer is stored as quantitative point
    // observations. Other hazards are event-backed (see /api/events).
    if (layer !== "all" && layer !== "earthquake") {
      return ok({ observations: [], meta: { note: `No point-observation layer for '${layer}' — events are served via /api/events` } });
    }

    const bbox = parseBbox(bboxStr ?? null);
    if (bboxStr && !bbox) return fail("validation_error", "bbox must be west,south,east,north in valid ranges", 400);

    const where: Parameters<typeof db.hazardObservation.findMany>[0]["where"] = {};
    if (bbox) {
      const lngFilter =
        bbox.west <= bbox.east
          ? { gte: bbox.west, lte: bbox.east }
          : { gte: bbox.west, lte: 180 }; // antimeridian-crossing handled client-side by splitting
      where.lat = { gte: bbox.south, lte: bbox.north };
      where.lng = lngFilter;
    }
    if (minMagnitude !== undefined) where.magnitude = { gte: minMagnitude };

    const rows = await db.hazardObservation.findMany({
      where,
      orderBy: [{ magnitude: "desc" }, { occurredAt: "desc" }],
      take: limit,
      select: {
        id: true,
        externalId: true,
        lat: true,
        lng: true,
        magnitude: true,
        magnitudeType: true,
        depthKm: true,
        value: true,
        unit: true,
        severityLabel: true,
        place: true,
        countryCode: true,
        occurredAt: true,
        sourceUrl: true,
      },
    });

    const lastRun = await db.ingestionRun.findFirst({
      where: { status: { in: ["success", "partial"] }, source: { key: "usgs-earthquakes" } },
      orderBy: { startedAt: "desc" },
      select: { datasetVersion: true, finishedAt: true },
    });

    return ok({
      observations: rows.map((r) => ({ ...r, layerKey: "earthquake", occurredAt: r.occurredAt.toISOString() })),
      meta: {
        datasetVersion: lastRun?.datasetVersion ?? null,
        generatedAt: lastRun?.finishedAt?.toISOString() ?? null,
        truncated: rows.length >= limit,
      },
    });
  } catch (err) {
    return fail("observations_error", err instanceof Error ? err.message : "Failed to load observations", 500);
  }
}
