import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-utils";
import { ensureSeed, ensureBootstrapped } from "@/lib/ingest/bootstrap";
import { LAYER_DEFS } from "@/lib/hazard-meta";
import type { LayerDTO, LayerStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeed();

    // Kick first import in the background when the database is fresh.
    const runCount = await db.ingestionRun.count();
    if (runCount === 0) void ensureBootstrapped().catch(() => undefined);

    const layers = await db.hazardLayer.findMany({ orderBy: { sortOrder: "asc" } });

    const obsCounts = await db.hazardObservation.groupBy({
      by: ["layerId"],
      _count: { _all: true },
      _max: { occurredAt: true },
    });
    const obsByLayer = new Map(obsCounts.map((c) => [c.layerId, c]));

    const eventCounts = await db.disasterEvent.groupBy({
      by: ["eventType"],
      _count: { _all: true },
      _max: { startDate: true },
    });
    const eventsByType = new Map(eventCounts.map((c) => [c.eventType, c]));

    const sources = await db.dataSource.findMany();
    const sourceByKey = new Map(sources.map((s) => [s.key, s]));

    const layerDefsByKey = new Map(LAYER_DEFS.map((d) => [d.key, d]));

    const dtos: LayerDTO[] = layers.map((l) => {
      const def = layerDefsByKey.get(l.key);
      const src = l.sourceKey ? sourceByKey.get(l.sourceKey) : undefined;

      let recordCount = 0;
      let lastUpdatedAt: Date | null = null;
      // Observation-backed layers (earthquake, waves) count from
      // hazard_observation; everything else counts documented events by type.
      const obs = obsByLayer.get(l.id);
      if (obs) {
        recordCount = obs._count._all;
        lastUpdatedAt = obs._max.occurredAt;
      } else {
        const c = eventsByType.get(l.hazardType);
        recordCount = c?._count._all ?? 0;
        lastUpdatedAt = c?._max.startDate ?? null;
      }

      let status: LayerStatus;
      let statusReason: string | null = null;
      if (!l.mapAvailable) {
        status = "location_level";
        statusReason = def?.statusReasonNoData ?? "Location-level indicator only.";
      } else if (recordCount > 0) {
        status = "live";
      } else if (src?.status === "needs_config") {
        status = "needs_config";
        statusReason = src.statusReason;
      } else if (src && (src.status === "failed" || src.status === "auto_disabled")) {
        status = "unavailable";
        statusReason = `Upstream import failing (${src.status}). Last error: ${src.statusReason ?? "unknown"}`;
      } else {
        status = "unavailable";
        statusReason = def?.statusReasonNoData ?? "No validated data imported yet.";
      }

      return {
        key: l.key,
        name: l.name,
        hazardType: l.hazardType,
        kind: l.kind as LayerDTO["kind"],
        description: l.description,
        units: l.units,
        methodology: l.methodology,
        resolution: l.resolution,
        temporalCoverage: l.temporalCoverage,
        licenseName: l.licenseName,
        licenseUrl: l.licenseUrl,
        limitations: l.limitations,
        sourceKey: l.sourceKey,
        colorHex: l.colorHex,
        mapAvailable: l.mapAvailable,
        status,
        statusReason,
        legend: def?.legend ?? null,
        recordCount,
        lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
      };
    });

    return ok({ layers: dtos });
  } catch (err) {
    return fail("layers_error", err instanceof Error ? err.message : "Failed to load layers", 500);
  }
}
