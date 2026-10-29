// ReliefWeb Disasters API v2 adapter.
//
// ReliefWeb requires a registered, approved `appname` (API returns 403 for
// unregistered clients). This adapter therefore only ever runs when
// RELIEFWEB_APPNAME is configured; until then the source reports
// needs_config and contributes nothing — the atlas never fabricates data
// for unconfigured sources.

import { db } from "@/lib/db";
import { fetchJsonSafe } from "@/lib/fetch-safe";
import { reliefwebResponseSchema } from "@/lib/validation";
import { env } from "@/lib/env";
import type { IngestContext, IngestResult } from "@/lib/ingest/sources";

const TYPE_MAP: { match: (typeName: string) => boolean; type: string }[] = [
  { match: (n) => n.toLowerCase().includes("flood"), type: "flood" },
  { match: (n) => n.toLowerCase().includes("earthquake"), type: "earthquake" },
  { match: (n) => n.toLowerCase().includes("cyclone") || n.toLowerCase().includes("storm"), type: "cyclone" },
  { match: (n) => n.toLowerCase().includes("drought"), type: "drought" },
  { match: (n) => n.toLowerCase().includes("fire"), type: "wildfire" },
  { match: (n) => n.toLowerCase().includes("slide"), type: "landslide" },
  { match: (n) => n.toLowerCase().includes("heat"), type: "extreme_heat" },
  { match: (n) => n.toLowerCase().includes("volcan"), type: "volcano" },
];

function mapReliefwebType(typeName: string | undefined): string {
  if (!typeName) return "other";
  for (const m of TYPE_MAP) if (m.match(typeName)) return m.type;
  return "other";
}

export async function ingestReliefwebDisasters(ctx: IngestContext): Promise<IngestResult> {
  const sourceId = ctx.sourceId;
  const appname = env.reliefwebAppname;
  if (!appname) throw new Error("RELIEFWEB_APPNAME is not configured — source cannot run");

  const url =
    `https://api.reliefweb.int/v2/disasters?appname=${encodeURIComponent(appname)}` +
    `&profile=list&limit=200&sort[]=date:desc`;

  const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 30_000 });
  const parsed = reliefwebResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `ReliefWeb payload failed schema validation: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  ctx.log(`fetched ${parsed.data.data.length} ReliefWeb disaster records`);

  const existing = await db.disasterEvent.findMany({
    where: { sourceId },
    select: { externalId: true, title: true },
  });
  const existingByExternalId = new Map(existing.map((r) => [r.externalId, r.title]));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  let latest: string | null = null;

  for (const rec of parsed.data.data) {
    const f = rec.fields;
    const eventType = mapReliefwebType(f.disaster_type?.name);
    const startDate = f.date?.event ? new Date(f.date.event) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) {
      invalid++;
      continue;
    }
    const primaryCountry = f.country?.[0];
    const loc = primaryCountry?.location ?? null;
    const lat = loc?.lat ?? null;
    const lng = loc?.lon ?? null;
    const kind = (f.status === "current" || f.status === "alert" ? "active" : "historical") as
      | "active"
      | "historical";
    const sourceUrl = f.url_alias ? `https://reliefweb.int/disaster/${f.url_alias}` : (f.url ?? null);
    if (!latest || startDate.toISOString() > latest) latest = startDate.toISOString();

    const row = {
      title: f.name.slice(0, 300),
      eventType,
      kind,
      lat: lat !== null && Number.isFinite(lat) ? lat : null,
      lng: lng !== null && Number.isFinite(lng) ? lng : null,
      placeName: null,
      countryName: primaryCountry?.name ?? null,
      countryCode: null,
      startDate,
      endDate: null,
      sourceUrl,
      summary: f.description ? f.description.replace(/<[^>]+>/g, " ").slice(0, 600) : null,
      verificationStatus: "source_reported" as const,
    };

    try {
      if (!existingByExternalId.has(rec.id)) {
        await db.disasterEvent.create({
          data: { sourceId, externalId: rec.id, sourceName: "ReliefWeb (UN OCHA)", ...row },
        });
        existingByExternalId.set(rec.id, row.title);
        inserted++;
      } else if (existingByExternalId.get(rec.id) !== row.title) {
        await db.disasterEvent.update({
          where: { sourceId_externalId: { sourceId, externalId: rec.id } },
          data: row,
        });
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      ctx.log(`row ${rec.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      invalid++;
    }
  }

  ctx.log(`inserted=${inserted} updated=${updated} skipped=${skipped} invalid=${invalid}`);

  return {
    recordsFetched: parsed.data.data.length,
    recordsInserted: inserted,
    recordsUpdated: updated,
    recordsSkipped: skipped,
    recordsInvalid: invalid,
    datasetVersion: latest,
  };
}
