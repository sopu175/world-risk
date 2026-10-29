import { db } from "@/lib/db";
import { ok, fail, zodFail } from "@/lib/api-utils";
import { observationsQuerySchema } from "@/lib/validation";
import { parseBbox } from "@/lib/geo";

export const dynamic = "force-dynamic";

// Layers stored as quantitative point observations. Other hazards are
// event-backed (see /api/events) or location-level only.
const OBSERVATION_LAYERS = new Set(["earthquake", "waves"]);

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

    if (layer !== "all" && !OBSERVATION_LAYERS.has(layer)) {
      return ok({
        observations: [],
        meta: { note: `No point-observation layer for '${layer}' — events are served via /api/events` },
      });
    }

    const bbox = parseBbox(bboxStr ?? null);
    if (bboxStr && !bbox) return fail("validation_error", "bbox must be west,south,east,north in valid ranges", 400);

    const where: Parameters<typeof db.hazardObservation.findMany>[0]["where"] = {};
    if (layer !== "all") {
      const targetLayer = await db.hazardLayer.findUnique({ where: { key: layer }, select: { id: true } });
      if (!targetLayer) return ok({ observations: [], meta: {} });
      where.layerId = targetLayer.id;
    }
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
      orderBy: [{ occurredAt: "desc" }, { magnitude: "desc" }],
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
        layer: { select: { key: true } },
      },
    });

    const lastQuakeRun = await db.ingestionRun.findFirst({
      where: { status: { in: ["success", "partial"] }, source: { key: "usgs-earthquakes" } },
      orderBy: { startedAt: "desc" },
      select: { datasetVersion: true, finishedAt: true },
    });

    return ok({
      observations: rows.map((r) => ({
        id: r.id,
        externalId: r.externalId,
        layerKey: r.layer.key,
        lat: r.lat,
        lng: r.lng,
        magnitude: r.magnitude,
        magnitudeType: r.magnitudeType,
        depthKm: r.depthKm,
        value: r.value,
        unit: r.unit,
        severityLabel: r.severityLabel,
        place: r.place,
        countryCode: r.countryCode,
        occurredAt: r.occurredAt.toISOString(),
        sourceUrl: r.sourceUrl,
      })),
      meta: {
        datasetVersion: lastQuakeRun?.datasetVersion ?? null,
        generatedAt: lastQuakeRun?.finishedAt?.toISOString() ?? null,
        truncated: rows.length >= limit,
      },
    });
  } catch (err) {
    return fail("observations_error", err instanceof Error ? err.message : "Failed to load observations", 500);
  }
}
