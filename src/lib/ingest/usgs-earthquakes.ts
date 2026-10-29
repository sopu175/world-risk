// USGS Earthquake Hazards Program adapter — M2.5+ past-30-day composite feed.
// Strategy: full-schema validation, then diff against stored external ids.
// Only genuinely new rows are bulk-inserted; only revised rows are updated.
// Existing valid data is never deleted or blindly replaced.

import { db } from "@/lib/db";
import { fetchJsonSafe } from "@/lib/fetch-safe";
import { usgsFeedSchema } from "@/lib/validation";
import type { IngestContext, IngestResult } from "@/lib/ingest/sources";

const FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson";

export async function ingestUsgsEarthquakes(ctx: IngestContext): Promise<IngestResult> {
  const sourceId = ctx.sourceId;

  const feed = await fetchJsonSafe<unknown>(FEED_URL, { timeoutMs: 30_000, maxBytes: 30 * 1024 * 1024 });
  const parsed = usgsFeedSchema.safeParse(feed);
  if (!parsed.success) {
    throw new Error(
      `USGS feed failed schema validation: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  ctx.log(`fetched ${parsed.data.features.length} features (feed count=${parsed.data.metadata.count})`);

  const layer = await db.hazardLayer.findUnique({ where: { key: "earthquake" } });
  if (!layer) throw new Error("earthquake layer missing from registry — run seed");

  const existing = await db.hazardObservation.findMany({
    where: { sourceId },
    select: { externalId: true, occurredAt: true },
  });
  const existingByExternalId = new Map(existing.map((r) => [r.externalId, r.occurredAt.getTime()]));

  type ValidRow = {
    externalId: string;
    lat: number;
    lng: number;
    depthKm: number;
    mag: number;
    magType: string | null;
    place: string | null;
    timeMs: number;
    url: string | null;
    raw: string;
  };

  const valid: ValidRow[] = [];
  let invalid = 0;
  let filteredLowMag = 0;

  for (const f of parsed.data.features) {
    const [lng, lat, depthKm] = f.geometry.coordinates;
    const mag = f.properties.mag;
    const timeMs = f.properties.time;
    const geoOk =
      Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    if (!geoOk || mag === null || timeMs === null) {
      invalid++;
      continue;
    }
    if (mag < 2.5) {
      filteredLowMag++;
      continue;
    }
    valid.push({
      externalId: f.id,
      lat,
      lng,
      depthKm: Number.isFinite(depthKm) ? depthKm : 0,
      mag,
      magType: f.properties.magType,
      place: f.properties.place,
      timeMs,
      url: f.properties.url,
      raw: JSON.stringify({
        id: f.id,
        mag,
        magType: f.properties.magType,
        place: f.properties.place,
        time: timeMs,
        updated: f.properties.updated,
        status: f.properties.status,
        tsunami: f.properties.tsunami,
        sig: f.properties.sig,
        url: f.properties.url,
      }),
    });
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const toCreate: ValidRow[] = [];
  const toUpdate: ValidRow[] = [];

  for (const row of valid) {
    const prev = existingByExternalId.get(row.externalId);
    if (prev === undefined) toCreate.push(row);
    else if (prev !== row.timeMs) toUpdate.push(row);
    else skipped++;
  }

  const baseRow = (r: ValidRow) => ({
    sourceId,
    layerId: layer.id,
    externalId: r.externalId,
    lat: r.lat,
    lng: r.lng,
    magnitude: r.mag,
    magnitudeType: r.magType,
    depthKm: r.depthKm,
    occurredAt: new Date(r.timeMs),
    place: r.place,
    sourceUrl: r.url,
    rawJson: r.raw,
  });

  // Bulk insert in chunks; on any unique-key race, fall back to per-row upserts.
  const CHUNK = 400;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const chunk = toCreate.slice(i, i + CHUNK);
    try {
      await db.hazardObservation.createMany({ data: chunk.map(baseRow) });
      inserted += chunk.length;
    } catch {
      for (const r of chunk) {
        try {
          await db.hazardObservation.upsert({
            where: { sourceId_externalId: { sourceId, externalId: r.externalId } },
            create: baseRow(r),
            update: {
              magnitude: r.mag,
              depthKm: r.depthKm,
              occurredAt: new Date(r.timeMs),
              place: r.place,
              magnitudeType: r.magType,
            },
          });
          inserted++;
        } catch {
          invalid++;
        }
      }
    }
  }

  for (const r of toUpdate) {
    try {
      await db.hazardObservation.update({
        where: { sourceId_externalId: { sourceId, externalId: r.externalId } },
        data: {
          magnitude: r.mag,
          magnitudeType: r.magType,
          depthKm: r.depthKm,
          place: r.place,
          occurredAt: new Date(r.timeMs),
          sourceUrl: r.url,
        },
      });
      updated++;
    } catch {
      skipped++;
    }
  }

  // Layer becomes available only after a validated import exists.
  await db.hazardLayer.update({ where: { key: "earthquake" }, data: { available: true } });

  ctx.log(
    `inserted=${inserted} updated=${updated} skipped=${skipped} invalid=${invalid} (mag<2.5 filtered: ${filteredLowMag})`,
  );

  return {
    recordsFetched: parsed.data.features.length,
    recordsInserted: inserted,
    recordsUpdated: updated,
    recordsSkipped: skipped + filteredLowMag,
    recordsInvalid: invalid,
    datasetVersion: new Date(parsed.data.metadata.generated).toISOString(),
  };
}
