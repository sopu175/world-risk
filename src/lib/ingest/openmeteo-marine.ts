// Open-Meteo Marine API adapter — global wave-height snapshot grid.
//
// Samples the current significant wave height from the ECMWF WAM model on a
// fixed 10° ocean grid (468 sample points; land cells return null and are
// skipped). Powers the "Ocean waves" map layer — the same quantity Windy
// renders as its Waves layer, from an open CC-BY 4.0 source.
//
// Upsert semantics: each grid point keeps exactly ONE row keyed
// `wave-<lat>-<lng>` and its value/occurredAt are refreshed on every run —
// this is a current-conditions snapshot, not an event history.

import { db } from "@/lib/db";
import { fetchJsonSafe } from "@/lib/fetch-safe";
import type { IngestContext, IngestResult } from "@/lib/ingest/sources";

const BATCH = 40; // locations per upstream request (comma-separated lat/lng)

const GRID_LAT = Array.from({ length: 13 }, (_, i) => -60 + i * 10); // -60 … 60
const GRID_LNG = Array.from({ length: 36 }, (_, i) => -180 + i * 10); // -180 … 170

/** Douglas sea-state label, derived only from the reported wave height. */
function seaStateLabel(h: number): string {
  if (h < 0.5) return "Calm (<0.5 m)";
  if (h < 1.25) return "Slight (0.5–1.25 m)";
  if (h < 2.5) return "Moderate (1.25–2.5 m)";
  if (h < 4) return "Rough (2.5–4 m)";
  if (h < 6) return "Very rough (4–6 m)";
  if (h < 9) return "High (6–9 m)";
  return "Phenomenal (≥9 m)";
}

type MarineResult = {
  latitude: number;
  longitude: number;
  elevation?: number | null;
  hourly?: {
    time?: string[];
    wave_height?: (number | null)[];
  };
};

type GridPoint = { lat: number; lng: number; height: number };

async function fetchBatch(lats: number[], lngs: number[], ctx: IngestContext): Promise<MarineResult[]> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lats.join(",")}&longitude=${lngs.join(",")}` +
    `&hourly=wave_height&forecast_days=1&timezone=GMT`;
  const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 25_000, retries: 4, retryDelayMs: 800 });
  // Multi-location requests return an array; a single-location request returns an object.
  const results: MarineResult[] = Array.isArray(payload) ? (payload as MarineResult[]) : [payload as MarineResult];
  if (results.length !== lats.length) {
    throw new Error(`Marine API returned ${results.length} results for ${lats.length} requested points`);
  }
  ctx.log(`batch ok: ${results.length} points`);
  return results;
}

export async function ingestOpenMeteoMarine(ctx: IngestContext): Promise<IngestResult> {
  const sourceId = ctx.sourceId;

  const layer = await db.hazardLayer.findUnique({ where: { key: "waves" } });
  if (!layer) throw new Error("waves layer missing from registry — run seed");

  const points: GridPoint[] = [];
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

  for (let i = 0; i < allLats.length; i += BATCH) {
    const lats = allLats.slice(i, i + BATCH);
    const lngs = allLngs.slice(i, i + BATCH);

    let results: MarineResult[] | null = null;
    for (let attempt = 1; attempt <= 3 && results === null; attempt++) {
      try {
        results = await fetchBatch(lats, lngs, ctx);
      } catch (e) {
        if (attempt === 3) {
          // Sandbox egress drops fresh connections intermittently — a failed
          // batch skips its cells (reported in the log) instead of failing the
          // whole run. A partial grid beats no grid, and the next cadence tick
          // refreshes it again.
          failedCells += lats.length;
          ctx.log(`batch ${Math.floor(i / BATCH) + 1}/${totalBatches} failed after retries: ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`);
        } else {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
    if (!results) continue;
    okBatches++;
    fetchedCells += results.length;

    const nowIso = new Date().toISOString();
    const currentHourPrefix = nowIso.slice(0, 13); // "YYYY-MM-DDTHH"
    for (const r of results) {
      if (r.elevation != null && r.elevation > 5) continue; // land cell (defensive)
      const hourly = r.hourly;
      if (!hourly?.time || !hourly.wave_height) continue;
      // Prefer the value at the current UTC hour; fall back to the nearest non-null.
      let idx = hourly.time.findIndex((t) => typeof t === "string" && t.startsWith(currentHourPrefix));
      if (idx < 0) idx = 0;
      let height: number | null = null;
      for (let probe = idx; probe < hourly.wave_height.length && height === null; probe++) {
        const v = hourly.wave_height[probe];
        height = typeof v === "number" && Number.isFinite(v) ? v : null;
      }
      if (height === null || height < 0) continue; // null ⇒ land/ice cell — skipped, never fabricated
      points.push({ lat: r.latitude, lng: r.longitude, height: Math.round(height * 100) / 100 });
    }
  }

  ctx.log(
    `grid sampled: ${points.length} ocean cells with data, ${fetchedCells - points.length} land/no-data cells, ` +
      `${failedCells} cells from ${totalBatches - okBatches} failed batch(es) (expected drops; refreshed next tick)`,
  );

  if (points.length < 50 || okBatches < Math.ceil(totalBatches / 2)) {
    throw new Error(
      `Marine grid too incomplete (${points.length} cells, ${okBatches}/${totalBatches} batches) — refusing to publish a partial snapshot`,
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
    const externalId = `wave-${Math.round(p.lat)}-${Math.round(p.lng)}`;
    const prev = existingByExternalId.get(externalId);
    const data = {
      lat: p.lat,
      lng: p.lng,
      value: p.height,
      unit: "m",
      severityLabel: seaStateLabel(p.height),
      occurredAt,
      place: null,
      sourceUrl: "https://open-meteo.com/en/docs/marine-weather-api",
    };
    try {
      if (prev === undefined) {
        await db.hazardObservation.create({
          data: { sourceId, layerId: layer.id, externalId, ...data },
        });
        inserted++;
      } else if (prev !== p.height) {
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
  await db.hazardLayer.update({ where: { key: "waves" }, data: { available: true } });

  ctx.log(`inserted=${inserted} updated=${updated} refreshed=${skipped}`);

  return {
    recordsFetched: fetchedCells,
    recordsInserted: inserted,
    recordsUpdated: updated,
    recordsSkipped: skipped,
    // Land/no-data cells are expected nulls (not validation failures) — they
    // are reported in the run log instead of counting as invalid.
    recordsInvalid: 0,
    datasetVersion,
  };
}
