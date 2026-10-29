// NASA EONET v3 adapter — natural events (wildfires, severe storms/cyclones,
// floods, droughts, landslides, volcanoes...). Public domain (NASA).
// Dedup key: EONET event id. Positions: latest geometry of the event track.

import { db } from "@/lib/db";
import { fetchJsonSafe } from "@/lib/fetch-safe";
import { eonetResponseSchema } from "@/lib/validation";
import type { IngestContext, IngestResult } from "@/lib/ingest/sources";
import { LAYER_DEFS } from "@/lib/hazard-meta";
import { HAZARD_TYPES } from "@/lib/types";

const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=365&limit=500";
// Sparse categories (volcanoes in particular) barely appear in the rolling
// 12-month window; the per-category archive endpoint reaches years back for
// the same reliable public-domain source.
const EONET_VOLCANO_ARCHIVE_URL =
  "https://eonet.gsfc.nasa.gov/api/v3/categories/volcanoes?status=all&days=1825&limit=250";

const CATEGORY_MAP: Record<string, string> = {
  severeStorms: "cyclone",
  wildfires: "wildfire",
  floods: "flood",
  drought: "drought",
  droughts: "drought",
  landslides: "landslide",
  volcanoes: "volcano",
  seaLakeIce: "other",
  dustHaze: "other",
  snow: "other",
  manmade: "other",
};

/** Cyclone severity labels derived only from reported wind magnitudes. */
function cycloneSeverityLabel(kts: number): string {
  if (kts >= 96) return "Major hurricane force (≥96 kts)";
  if (kts >= 64) return "Hurricane force (64–95 kts)";
  if (kts >= 34) return "Tropical storm force (34–63 kts)";
  return "Tropical depression (<34 kts)";
}

/** Deep-first search for the first valid [lng, lat] numeric pair inside
 *  arbitrary GeoJSON coordinate nesting (Point, LineString, Polygon...). */
function normalizeCoords(coords: readonly unknown[]): { lat: number; lng: number } | null {
  // Point: coordinates are already a flat [lng, lat] pair.
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    const [lng, lat] = coords;
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
    return null;
  }
  const stack = [...coords];
  while (stack.length) {
    const cur = stack.shift();
    if (!Array.isArray(cur)) continue;
    if (cur.length >= 2 && typeof cur[0] === "number" && typeof cur[1] === "number") {
      const [lng, lat] = cur;
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
      continue;
    }
    stack.unshift(...cur);
  }
  return null;
}

export async function ingestNasaEonet(ctx: IngestContext): Promise<IngestResult> {
  const sourceId = ctx.sourceId;

  const payload = await fetchJsonSafe<unknown>(EONET_URL, { timeoutMs: 30_000 });

  // Archive pass for sparse categories — merged into the same dedup pool.
  let archiveEvents: unknown[] = [];
  try {
    const archive = await fetchJsonSafe<unknown>(EONET_VOLCANO_ARCHIVE_URL, { timeoutMs: 30_000 });
    if (archive && typeof archive === "object" && Array.isArray((archive as { events?: unknown[] }).events)) {
      archiveEvents = (archive as { events: unknown[] }).events;
      ctx.log(`volcano archive pass: ${archiveEvents.length} historical events (5-year window)`);
    }
  } catch (e) {
    // Archive is additive — a failure here must not fail the whole run.
    ctx.log(`volcano archive pass skipped: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }

  const rawEvents = [
    ...((payload as { events?: unknown[] }).events ?? []),
    ...archiveEvents,
  ];
  if (!Array.isArray((payload as { events?: unknown[] }).events)) {
    throw new Error("EONET payload missing events array");
  }
  const parsed = eonetResponseSchema.safeParse({ events: rawEvents });
  if (!parsed.success) {
    throw new Error(
      `EONET payload failed schema validation: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  ctx.log(`fetched ${parsed.data.events.length} EONET events (12-month window + sparse-category archive)`);

  const layers = await db.hazardLayer.findMany();
  const layerByHazardType = new Map(layers.map((l) => [l.hazardType, l]));

  const existing = await db.disasterEvent.findMany({
    where: { sourceId },
    select: {
      externalId: true,
      title: true,
      startDate: true,
      endDate: true,
      severityValue: true,
      lat: true,
      lng: true,
      kind: true,
    },
  });
  const existingByKey = new Map(existing.map((r) => [r.externalId, r]));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  let maxSeenDate: number | null = null;

  for (const ev of parsed.data.events) {
    const category = ev.categories[0]?.id ?? "";
    const eventType = CATEGORY_MAP[category] ?? "other";

    const openDate = ev.geometry[0]?.date ? new Date(ev.geometry[0].date) : null;
    const closeDate = ev.closed ? new Date(ev.closed) : null;
    const lastGeom = ev.geometry[ev.geometry.length - 1];
    const pos = normalizeCoords(lastGeom.coordinates);
    const openOk = openDate !== null && !Number.isNaN(openDate.getTime());

    if (!pos || !openOk) {
      invalid++;
      continue;
    }

    const sevVal = lastGeom.magnitudeValue ?? null;
    const sevUnit = lastGeom.magnitudeUnit ?? null;
    const severityLabel =
      eventType === "cyclone" && sevVal !== null && sevUnit?.toLowerCase().startsWith("kt")
        ? cycloneSeverityLabel(sevVal)
        : null;

    if (closeDate && Number.isNaN(closeDate.getTime())) invalid++;
    if (maxSeenDate === null || lastGeom.date > new Date(maxSeenDate).toISOString()) {
      const t = new Date(lastGeom.date).getTime();
      if (!Number.isNaN(t)) maxSeenDate = t;
    }

    const row = {
      title: ev.title.slice(0, 300),
      eventType,
      kind: (ev.closed ? "historical" : "active") as "historical" | "active",
      lat: pos.lat,
      lng: pos.lng,
      startDate: openDate!,
      endDate: closeDate && !Number.isNaN(closeDate.getTime()) ? closeDate : null,
      severityValue: sevVal,
      severityUnit: sevUnit,
      severityLabel,
      verificationStatus: (ev.sources.length >= 2 ? "cross_verified" : "source_reported") as
        | "cross_verified"
        | "source_reported",
      summary: ev.description ? ev.description.slice(0, 600) : null,
      sourceUrl: ev.link ?? null,
    };

    const prev = existingByKey.get(ev.id);
    try {
      if (!prev) {
        await db.disasterEvent.create({
          data: { sourceId, externalId: ev.id, sourceName: "NASA EONET", ...row },
        });
        inserted++;
      } else {
        const changed =
          prev.title !== row.title ||
          prev.kind !== row.kind ||
          prev.severityValue !== row.severityValue ||
          prev.lat !== row.lat ||
          prev.lng !== row.lng ||
          (prev.endDate?.getTime() ?? null) !== (row.endDate?.getTime() ?? null);
        if (changed) {
          await db.disasterEvent.update({
            where: { sourceId_externalId: { sourceId, externalId: ev.id } },
            data: row,
          });
          updated++;
        } else {
          skipped++;
        }
      }
    } catch (e) {
      ctx.log(`row ${ev.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      invalid++;
    }
  }

  // Mark event-backed layers available when their hazard type has data.
  const countsByType = new Map<string, number>();
  const all = await db.disasterEvent.groupBy({ by: ["eventType"], _count: { _all: true } });
  for (const g of all) countsByType.set(g.eventType, g._count._all);

  for (const def of LAYER_DEFS) {
    if (!def.mapAvailable || def.hazardType === "earthquake") continue;
    const count = countsByType.get(def.hazardType) ?? 0;
    if (count > 0 && HAZARD_TYPES.includes(def.hazardType as (typeof HAZARD_TYPES)[number])) {
      await db.hazardLayer.update({ where: { key: def.key }, data: { available: true } });
    }
  }

  ctx.log(`inserted=${inserted} updated=${updated} skipped=${skipped} invalid=${invalid}`);

  return {
    recordsFetched: parsed.data.events.length,
    recordsInserted: inserted,
    recordsUpdated: updated,
    recordsSkipped: skipped,
    recordsInvalid: invalid,
    datasetVersion: maxSeenDate ? new Date(maxSeenDate).toISOString() : null,
  };
}
