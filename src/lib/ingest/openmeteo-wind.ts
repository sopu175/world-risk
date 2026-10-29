// Open-Meteo Weather Forecast API adapter — global near-surface wind grid.
//
// Samples the current 10 m wind speed, gusts and direction from the
// ECMWF IFS / NOAA GFS forecast blend on a fixed 10° latitude/longitude grid
// (540 sample points, 60°S–80°N — both land and ocean). Powers the
// "Wind & gusts" map layer — the same quantity Windy.com renders as its wind
// layer, from an open CC-BY 4.0 source.
//
// Upsert semantics: each grid point keeps exactly ONE row keyed
// `wind-<lat>-<lng>` and its value/occurredAt are refreshed on every run —
// this is a current-conditions snapshot, not an event history.

import { db } from "@/lib/db";
import { fetchJsonSafe } from "@/lib/fetch-safe";
import { openMeteoWindGridSchema } from "@/lib/validation";
import type { IngestContext, IngestResult } from "@/lib/ingest/sources";
import { beaufortOf, compassOf } from "@/lib/hazard-meta";

const BATCH = 40; // locations per upstream request (comma-separated lat/lng)

// 60°S … 80°N — covers every populated latitude; the polar caps add no
// informational value and some forecast cells there return nulls.
const GRID_LAT = Array.from({ length: 15 }, (_, i) => -60 + i * 10); // -60 … 80
const GRID_LNG = Array.from({ length: 36 }, (_, i) => -180 + i * 10); // -180 … 170

type WindSample = {
  lat: number;
  lng: number;
  speedKmh: number;
  gustKmh: number | null;
  dirDeg: number | null;
};

async function fetchBatch(lats: number[], lngs: number[], ctx: IngestContext): Promise<WindSample[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(",")}&longitude=${lngs.join(",")}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&forecast_days=1&timezone=GMT`;
  const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 25_000, retries: 4, retryDelayMs: 800 });
  const parsed = openMeteoWindGridSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Wind API response failed schema validation: ${parsed.error.message.slice(0, 180)}`);
  }
  const results = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  if (results.length !== lats.length) {
    throw new Error(`Wind API returned ${results.length} results for ${lats.length} requested points`);
  }
  ctx.log(`batch ok: ${results.length} points`);

  const currentHourPrefix = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  const samples: WindSample[] = [];

  for (const r of results) {
    const hourly = r.hourly;
    if (!hourly?.time || !hourly.wind_speed_10m) continue;
    // Prefer the value at the current UTC hour; fall back to the first non-null.
    let idx = hourly.time.findIndex((t) => typeof t === "string" && t.startsWith(currentHourPrefix));
    if (idx < 0) idx = 0;
    const speed = firstFinite(hourly.wind_speed_10m, idx);
    if (speed === null) continue; // null ⇒ no model data for this cell — skipped, never fabricated
    samples.push({
      lat: r.latitude,
      lng: r.longitude,
      speedKmh: Math.round(speed * 10) / 10,
      gustKmh: firstFinite(hourly.wind_gusts_10m ?? [], idx),
      dirDeg: firstFinite(hourly.wind_direction_10m ?? [], idx),
    });
  }
  return samples;
}

function firstFinite(arr: (number | null)[], from: number): number | null {
  for (let i = Math.max(0, from); i < arr.length; i++) {
    const v = arr[i];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

export async function ingestOpenMeteoWind(ctx: IngestContext): Promise<IngestResult> {
  const sourceId = ctx.sourceId;

  const layer = await db.hazardLayer.findUnique({ where: { key: "wind" } });
  if (!layer) throw new Error("wind layer missing from registry — run seed");

  const allLats: number[] = [];
  const allLngs: number[] = [];
  for (const lat of GRID_LAT) {
    for (const lng of GRID_LNG) {
      allLats.push(lat);
      allLngs.push(lng);
    }
  }

  let fetchedCells = 0;
  let failedCells = 0;
  const totalBatches = Math.ceil(allLats.length / BATCH);
  let okBatches = 0;
  const points: WindSample[] = [];

  for (let i = 0; i < allLats.length; i += BATCH) {
    const lats = allLats.slice(i, i + BATCH);
    const lngs = allLngs.slice(i, i + BATCH);

    let samples: WindSample[] | null = null;
    for (let attempt = 1; attempt <= 3 && samples === null; attempt++) {
      try {
        samples = await fetchBatch(lats, lngs, ctx);
      } catch (e) {
        if (attempt === 3) {
          // Sandbox egress drops fresh connections intermittently — a failed
          // batch skips its cells (reported in the log) instead of failing the
          // whole run. A partial grid beats no grid, and the next cadence tick
          // refreshes it again.
          failedCells += lats.length;
          ctx.log(
            `batch ${Math.floor(i / BATCH) + 1}/${totalBatches} failed after retries: ${
              e instanceof Error ? e.message.slice(0, 140) : String(e)
            }`,
          );
        } else {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
    if (!samples) continue;
    okBatches++;
    fetchedCells += samples.length;
    points.push(...samples);
  }

  ctx.log(
    `grid sampled: ${points.length} cells with data, ${fetchedCells - points.length} no-data cells, ` +
      `${failedCells} cells from ${totalBatches - okBatches} failed batch(es) (expected drops; refreshed next tick)`,
  );

  if (points.length < 300 || okBatches < Math.ceil(totalBatches / 2)) {
    throw new Error(
      `Wind grid too incomplete (${points.length} cells, ${okBatches}/${totalBatches} batches) — refusing to publish a partial snapshot`,
    );
  }

  // Upsert each grid point (snapshot semantics).
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const occurredAt = new Date();
  const datasetVersion = occurredAt.toISOString();

  const existing = await db.hazardObservation.findMany({
    where: { sourceId },
    select: { externalId: true, value: true },
  });
  const existingByExternalId = new Map(existing.map((r) => [r.externalId, r.value]));

  for (const p of points) {
    const externalId = `wind-${Math.round(p.lat)}-${Math.round(p.lng)}`;
    const prev = existingByExternalId.get(externalId);
    const beaufort = beaufortOf(p.speedKmh);
    const compass = compassOf(p.dirDeg);
    const gustPart = p.gustKmh !== null ? ` · gusts ${Math.round(p.gustKmh)} km/h` : "";
    const dirPart = compass ? ` · from ${compass}` : "";
    const data = {
      lat: p.lat,
      lng: p.lng,
      value: p.speedKmh,
      unit: "km/h",
      severityLabel: `Beaufort ${beaufort.b} ${beaufort.name}${gustPart}${dirPart}`,
      occurredAt,
      place: null,
      sourceUrl: "https://open-meteo.com/en/docs",
    };
    try {
      if (prev === undefined) {
        await db.hazardObservation.create({
          data: { sourceId, layerId: layer.id, externalId, ...data },
        });
        inserted++;
      } else if (prev !== p.speedKmh) {
        await db.hazardObservation.update({
          where: { sourceId_externalId: { sourceId, externalId } },
          data,
        });
        updated++;
      } else {
        // same value — still refresh occurredAt so freshness reflects the check
        await db.hazardObservation.update({
          where: { sourceId_externalId: { sourceId, externalId } },
          data: { occurredAt },
        });
        skipped++;
      }
    } catch (e) {
      ctx.log(`cell ${externalId} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Layer becomes available only after a validated import exists.
  await db.hazardLayer.update({ where: { key: "wind" }, data: { available: true } });

  ctx.log(`inserted=${inserted} updated=${updated} refreshed=${skipped}`);

  return {
    recordsFetched: fetchedCells,
    recordsInserted: inserted,
    recordsUpdated: updated,
    recordsSkipped: skipped,
    recordsInvalid: 0,
    datasetVersion,
  };
}
