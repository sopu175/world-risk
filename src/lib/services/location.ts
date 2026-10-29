// Location intelligence service.
//
// Aggregates, per searched location:
//  - geographic overview (reverse geocode, elevation, timezone)
//  - earthquake history indicator (USGS FDSN 10-year catalog excerpt)
//  - extreme heat indicator (ERA5 daily Tmax 1995–present via Open-Meteo)
//  - air quality indicator (CAMS PM2.5 via Open-Meteo)
//  - nearby documented disaster events (from the local event store)
//
// Every indicator fails independently and reports `available: false` with a
// reason — one degraded upstream never blanks the whole panel. All upstream
// responses are schema-validated (zod) before use.

import { db } from "@/lib/db";
import { fetchJsonSafe } from "@/lib/fetch-safe";
import {
  openMeteoGeocodeSchema,
  openMeteoArchiveSchema,
  openMeteoAirQualitySchema,
  usgsFeedSchema,
} from "@/lib/validation";
import {
  openMeteoGeocodeResponseSchema,
  nominatimReverseSchema,
  openMeteoForecastSchema,
} from "@/lib/validation-extra";
import { TtlCache } from "@/lib/cache";
import { haversineKm, round, formatCoord } from "@/lib/geo";
import { pm25Category } from "@/lib/hazard-meta";
import type {
  GeoSearchResult,
  IndicatorDTO,
  LocationDetailDTO,
  SourceRef,
  EventDTO,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Caches (in-process, TTL — swapped for distributed cache in production)
// ---------------------------------------------------------------------------
const searchCache = new TtlCache<GeoSearchResult[]>(10 * 60_000, 300);
const reverseCache = new TtlCache<ReverseInfo>(24 * 3600_000, 1000);
const forecastCache = new TtlCache<ForecastInfo>(30 * 60_000, 1000);
const quakeHistoryCache = new TtlCache<QuakeHistory>(12 * 3600_000, 300);
const heatCache = new TtlCache<HeatIndicator>(24 * 3600_000, 200);
const airCache = new TtlCache<AirIndicator>(30 * 60_000, 500);

type ReverseInfo = {
  name: string | null;
  country: string | null;
  countryCode: string | null;
  admin1: string | null;
};

type ForecastInfo = {
  elevation: number | null;
  timezone: string | null;
  localtime: string | null;
  currentTempC: number | null;
};

type QuakeHistory = {
  count10y: number;
  maxMag10y: number | null;
  perYear: { year: number; count: number; maxMag: number }[];
  events: { id: string; date: string; mag: number; depthKm: number | null; place: string | null; url: string | null }[];
};

type HeatIndicator = {
  thresholdC: number;
  baselineHotDaysPerYear: number;
  recentHotDaysPerYear: number | null;
  trendDeltaPct: number | null;
  coverageStart: number;
  coverageEnd: number;
  annualSeries: { year: number; hotDays: number; maxTmaxC: number | null }[];
  climatology: { month: string; meanTmaxC: number }[];
};

type AirIndicator = {
  pm25Current: number | null;
  pm25Last24hMean: number | null;
  category: { label: string; color: string } | null;
  hourly: { time: string; pm25: number | null }[];
  hoursCovered: number;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchLocations(q: string, count = 6): Promise<GeoSearchResult[]> {
  const key = `${q.toLowerCase()}::${count}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`;
  const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 12_000, retries: 6, retryDelayMs: 400 });
  const parsed = openMeteoGeocodeResponseSchema.parse(payload);
  const results: GeoSearchResult[] = (parsed.results ?? []).map((r) => ({
    id: `gn-${r.id}`,
    name: r.name,
    admin1: r.admin1 ?? null,
    country: r.country ?? null,
    countryCode: r.country_code ?? null,
    latitude: r.latitude,
    longitude: r.longitude,
    elevation: r.elevation ?? null,
    population: r.population ?? null,
    timezone: r.timezone ?? null,
    featureCode: r.feature_code ?? null,
  }));
  searchCache.set(key, results);
  return results;
}

export async function buildLocationDetail(input: {
  latitude: number;
  longitude: number;
  name?: string;
  country?: string;
  countryCode?: string;
}): Promise<LocationDetailDTO> {
  const { latitude, longitude } = input;

  const [reverse, forecast] = await Promise.all([
    reverseGeocode(latitude, longitude).catch((): ReverseInfo | null => null),
    fetchForecastMeta(latitude, longitude).catch((): ForecastInfo | null => null),
  ]);

  const name =
    input.name?.trim() ||
    reverse?.name ||
    (reverse?.admin1 ? `${reverse.admin1} area` : null) ||
    formatCoord(latitude, longitude);
  const country = input.country?.trim() || reverse?.country || null;
  const countryCode = input.countryCode?.trim() || reverse?.countryCode || null;

  const [quakeIndicator, heatIndicator, airIndicator, nearbyEvents] = await Promise.all([
    buildQuakeIndicator(latitude, longitude),
    buildHeatIndicator(latitude, longitude),
    buildAirIndicator(latitude, longitude),
    findNearbyEvents(latitude, longitude, 300, 365, 25),
  ]);

  return {
    location: {
      name,
      latitude: round(latitude, 4),
      longitude: round(longitude, 4),
      country,
      countryCode,
      admin1: reverse?.admin1 ?? null,
      elevationM: forecast?.elevation ?? null,
      timezone: forecast?.timezone ?? null,
      population: null,
      localTime: forecast?.localtime ?? null,
    },
    indicators: [quakeIndicator, heatIndicator, airIndicator],
    nearbyEvents,
    disclaimers: [
      "Indicators are area-level estimates (reanalysis or model grid cells, 25–40 km; seismic catalog within 300 km). They describe the surrounding area, not any specific address or plot.",
      "Country- or region-level hazard data cannot be used to judge street-level safety at this location.",
      "Absence of recorded events is not proof of absence of hazard — reporting completeness varies by region and period.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Upstream helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reverse geocoding — OpenStreetMap Nominatim.
// Policy compliance (https://operations.osmfoundation.org/policies/nominatim/):
// absolute max 1 req/s, identifying User-Agent (set in fetch-safe), results
// cached 24 h per ~5 km cell, and a hard client-side 1.1 s spacing between
// requests regardless of cache state.
// ---------------------------------------------------------------------------
let lastNominatimCall = 0;

async function reverseGeocode(lat: number, lng: number): Promise<ReverseInfo> {
  const key = `${round(lat, 2)},${round(lng, 2)}`;
  const cached = reverseCache.get(key);
  if (cached) return cached;

  const elapsed = Date.now() - lastNominatimCall;
  if (elapsed < 1100) await new Promise((r) => setTimeout(r, 1100 - elapsed));
  lastNominatimCall = Date.now();

  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
    `&format=jsonv2&zoom=10&addressdetails=1`;
  const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 12_000, retries: 6, retryDelayMs: 400 });
  const parsed = nominatimReverseSchema.parse(payload);
  const addr = parsed.address ?? {};
  const name =
    parsed.name ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    (parsed.display_name ? parsed.display_name.split(",")[0] : null);
  const info: ReverseInfo = {
    name,
    country: addr.country ?? null,
    countryCode: addr.country_code?.toUpperCase() ?? null,
    admin1: addr.state ?? null,
  };
  reverseCache.set(key, info);
  return info;
}

async function fetchForecastMeta(lat: number, lng: number): Promise<ForecastInfo> {
  const key = `${round(lat, 2)},${round(lng, 2)}`;
  const cached = forecastCache.get(key);
  if (cached) return cached;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m&timezone=auto&forecast_days=1`;
  const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 12_000 });
  const parsed = openMeteoForecastSchema.parse(payload);
  const info: ForecastInfo = {
    elevation: parsed.elevation ?? null,
    timezone: parsed.timezone ?? null,
    localtime: parsed.current?.time ?? null,
    currentTempC: parsed.current?.temperature_2m ?? null,
  };
  forecastCache.set(key, info);
  return info;
}

async function buildQuakeIndicator(lat: number, lng: number): Promise<IndicatorDTO> {
  const source = await sourceRef("usgs-earthquakes", "USGS Earthquake Hazards Program", "https://earthquake.usgs.gov/");
  const meta = {
    key: "earthquake_history",
    name: "Earthquake history (10-year catalog excerpt)",
    unavailableReason: null,
    source,
    methodology:
      "USGS FDSN event service query: epicentres within 300 km of the location, magnitude ≥ 4.5, past 10 years, ordered by magnitude. Catalog includes reviewed and preliminary solutions.",
    limitations:
      "Catalog completeness varies by region and magnitude. Epicentre distance ≠ shaking intensity — local soil and building standards dominate felt impact.",
  };

  try {
    const cell = `${round(lat, 1)},${round(lng, 1)}`;
    const cached = quakeHistoryCache.get(cell);
    if (cached) {
      return { ...meta, available: true, valueSummary: `${cached.count10y} events M≥4.5 within 300 km in the past 10 years (max M ${cached.maxMag10y ?? "—"})`, data: cached };
    }

    const start = new Date(Date.now() - 10 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const url =
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}` +
      `&maxradiuskm=300&starttime=${start}&minmagnitude=4.5&orderby=magnitude&limit=1000`;
    const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 25_000 });
    const parsed = usgsFeedSchema.safeParse(payload);
    if (!parsed.success) throw new Error("USGS FDSN response failed schema validation");

    const features = parsed.data.features;
    const perYearMap = new Map<number, { count: number; maxMag: number }>();
    for (const f of features) {
      const year = new Date(f.properties.time ?? 0).getUTCFullYear();
      const mag = f.properties.mag ?? 0;
      const agg = perYearMap.get(year) ?? { count: 0, maxMag: mag };
      agg.count += 1;
      agg.maxMag = Math.max(agg.maxMag, mag);
      perYearMap.set(year, agg);
    }
    const perYear = [...perYearMap.entries()]
      .map(([year, agg]) => ({ year, count: agg.count, maxMag: round(agg.maxMag, 1) }))
      .sort((a, b) => a.year - b.year);

    const events = features.slice(0, 15).map((f) => ({
      id: f.id,
      date: new Date(f.properties.time ?? 0).toISOString(),
      mag: f.properties.mag ?? 0,
      depthKm: f.geometry.coordinates[2] ?? null,
      place: f.properties.place,
      url: f.properties.url,
    }));

    const history: QuakeHistory = {
      count10y: features.length,
      maxMag10y: features.length ? round(Math.max(...features.map((f) => f.properties.mag ?? 0)), 1) : null,
      perYear,
      events,
    };
    quakeHistoryCache.set(cell, history);
    return {
      ...meta,
      available: true,
      valueSummary: `${history.count10y} events M≥4.5 within 300 km in the past 10 years (max M ${history.maxMag10y ?? "—"})`,
      data: history,
    };
  } catch (err) {
    return { ...meta, available: false, unavailableReason: reasonOf(err), valueSummary: null, data: null };
  }
}

async function buildHeatIndicator(lat: number, lng: number): Promise<IndicatorDTO> {
  const source = await sourceRef("openmeteo-era5", "Open-Meteo ERA5 Historical Archive", "https://open-meteo.com/en/docs/historical-weather-api");
  const meta = {
    key: "extreme_heat",
    name: "Extreme heat profile (ERA5, 1995–present)",
    unavailableReason: null,
    source,
    methodology:
      "Daily maximum temperature from the ERA5 reanalysis (~25–31 km grid) via Open-Meteo. Hot-day threshold: 35 °C, auto-lowered to the local 95th-percentile Tmax (ceil) in climates that rarely reach 35 °C. Trend compares the last 5 complete years with the full-period mean. Current year excluded until complete.",
    limitations:
      "Grid-cell averages — do not capture intra-urban heat-island variation. Reanalysis latency ≈ 5 days.",
  };

  try {
    const cell = `${round(lat, 1)},${round(lng, 1)}`;
    const cached = heatCache.get(cell);
    if (cached) {
      return { ...meta, available: true, valueSummary: heatSummary(cached), data: cached };
    }

    const end = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
      `&start_date=1995-01-01&end_date=${end}&daily=temperature_2m_max&timezone=GMT`;
    const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 40_000, maxBytes: 10 * 1024 * 1024 });
    const archive = openMeteoArchiveSchema.parse(payload);

    const { time, temperature_2m_max: tmax } = archive.daily;
    const currentYear = new Date().getUTCFullYear();

    // Percentile of all non-null Tmax
    const all = tmax.filter((v): v is number => v !== null).sort((a, b) => a - b);
    if (all.length < 365) throw new Error("ERA5 series too short for this grid cell");
    const p95 = all[Math.floor(0.95 * (all.length - 1))];
    const thresholdC = Math.min(35, Math.ceil(p95));

    const perYear = new Map<number, { hotDays: number; maxTmax: number | null }>();
    const perMonth = Array.from({ length: 12 }, () => ({ sum: 0, n: 0 }));
    for (let i = 0; i < time.length; i++) {
      const v = tmax[i];
      if (v === null) continue;
      const d = new Date(time[i] + "T00:00:00Z");
      const y = d.getUTCFullYear();
      if (y >= currentYear) continue; // exclude incomplete current year
      const agg = perYear.get(y) ?? { hotDays: 0, maxTmax: null };
      if (v >= thresholdC) agg.hotDays += 1;
      agg.maxTmax = agg.maxTmax === null ? v : Math.max(agg.maxTmax, v);
      perYear.set(y, agg);
      const m = d.getUTCMonth();
      perMonth[m].sum += v;
      perMonth[m].n += 1;
    }

    const years = [...perYear.keys()].sort((a, b) => a - b);
    if (years.length < 10) throw new Error("Insufficient complete years in ERA5 series");

    const annualSeries = years.map((y) => {
      const agg = perYear.get(y)!;
      return { year: y, hotDays: agg.hotDays, maxTmaxC: agg.maxTmax === null ? null : round(agg.maxTmax, 1) };
    });

    const baseline = annualSeries.reduce((s, r) => s + r.hotDays, 0) / annualSeries.length;
    const last5 = annualSeries.slice(-5);
    const recent = last5.reduce((s, r) => s + r.hotDays, 0) / last5.length;
    const trendDeltaPct = baseline >= 0.5 ? round(((recent - baseline) / baseline) * 100, 0) : null;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const climatology = monthNames.map((m, i) => ({
      month: m,
      meanTmaxC: perMonth[i].n > 0 ? round(perMonth[i].sum / perMonth[i].n, 1) : 0,
    }));

    const heat: HeatIndicator = {
      thresholdC,
      baselineHotDaysPerYear: round(baseline, 1),
      recentHotDaysPerYear: round(recent, 1),
      trendDeltaPct,
      coverageStart: years[0],
      coverageEnd: years[years.length - 1],
      annualSeries,
      climatology,
    };
    heatCache.set(cell, heat);
    return { ...meta, available: true, valueSummary: heatSummary(heat), data: heat };
  } catch (err) {
    return { ...meta, available: false, unavailableReason: reasonOf(err), valueSummary: null, data: null };
  }
}

function heatSummary(h: HeatIndicator): string {
  const trend =
    h.trendDeltaPct === null ? "" : ` — ${h.trendDeltaPct >= 0 ? "+" : ""}${h.trendDeltaPct}% vs baseline`;
  return `${h.baselineHotDaysPerYear} hot days/yr (Tmax ≥ ${h.thresholdC} °C) on average ${h.coverageStart}–${h.coverageEnd}${trend}`;
}

async function buildAirIndicator(lat: number, lng: number): Promise<IndicatorDTO> {
  const source = await sourceRef("openmeteo-cams", "Open-Meteo Air Quality (CAMS)", "https://open-meteo.com/en/docs/air-quality-api");
  const meta = {
    key: "air_quality",
    name: "Air quality — PM2.5 (CAMS, last 72 h)",
    unavailableReason: null,
    source,
    methodology:
      "Copernicus Atmosphere Monitoring Service global composition analysis/forecast via Open-Meteo, sampled at the location. WHO 24-hour guideline: 15 µg/m³.",
    limitations:
      "≈ 40 km model grid — does not resolve street-level gradients or point sources. Model output, not ground measurements.",
  };

  try {
    const cell = `${round(lat, 1)},${round(lng, 1)}`;
    const cached = airCache.get(cell);
    if (cached) {
      return { ...meta, available: true, valueSummary: airSummary(cached), data: cached };
    }

    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&hourly=pm2_5&past_days=3&forecast_days=1&timezone=GMT`;
    const payload = await fetchJsonSafe<unknown>(url, { timeoutMs: 20_000 });
    const air_payload = openMeteoAirQualitySchema.parse(payload);

    const { time, pm2_5 } = air_payload.hourly;
    const hourly: { time: string; pm25: number | null }[] = time.map((t, i) => ({ time: t, pm25: pm2_5[i] ?? null }));
    const vals = hourly.filter((h) => h.pm25 !== null).map((h) => h.pm25 as number);
    const last24 = vals.slice(-24);
    const pm25Last24hMean = last24.length ? round(last24.reduce((s, v) => s + v, 0) / last24.length, 1) : null;
    const pm25Current = vals.length ? round(vals[vals.length - 1], 1) : null;
    const cat = pm25Category(pm25Last24hMean);

    const air: AirIndicator = {
      pm25Current,
      pm25Last24hMean,
      category: cat ? { label: cat.label, color: cat.color } : null,
      hourly,
      hoursCovered: vals.length,
    };
    airCache.set(cell, air);
    return { ...meta, available: true, valueSummary: airSummary(air), data: air };
  } catch (err) {
    return { ...meta, available: false, unavailableReason: reasonOf(err), valueSummary: null, data: null };
  }
}

function airSummary(a: AirIndicator): string {
  const mean = a.pm25Last24hMean !== null ? `${a.pm25Last24hMean} µg/m³ (24 h mean)` : "no data";
  return `PM2.5 ${mean}${a.category ? ` — ${a.category.label}` : ""}`;
}

async function findNearbyEvents(
  lat: number,
  lng: number,
  radiusKm: number,
  days: number,
  limit: number,
): Promise<{ radiusKm: number; events: EventDTO[] }> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const rows = await db.disasterEvent.findMany({
    where: {
      lat: { not: null },
      lng: { not: null },
      startDate: { gte: since },
      OR: [{ kind: "active" }, { kind: "historical" }],
    },
    orderBy: { startDate: "desc" },
    take: 600,
  });

  const events: EventDTO[] = rows
    .map((r) => ({
      id: r.id,
      externalId: r.externalId,
      title: r.title,
      eventType: r.eventType,
      kind: r.kind as EventDTO["kind"],
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
      verificationStatus: r.verificationStatus as EventDTO["verificationStatus"],
      summary: r.summary,
    }))
    .filter((e) => e.lat !== null && e.lng !== null && haversineKm(lat, lng, e.lat, e.lng) <= radiusKm)
    .slice(0, limit);

  return { radiusKm, events };
}

async function sourceRef(key: string, fallbackName: string, fallbackUrl: string): Promise<SourceRef> {
  const ds = await db.dataSource.findUnique({
    where: { key },
    select: { name: true, provider: true, homepageUrl: true, licenseName: true, licenseUrl: true, lastSuccessAt: true },
  });
  const lastRun = await db.ingestionRun.findFirst({
    where: { source: { key }, status: { in: ["success", "partial"] } },
    orderBy: { startedAt: "desc" },
    select: { datasetVersion: true },
  });
  return {
    name: ds?.name ?? fallbackName,
    provider: ds?.provider ?? fallbackName,
    url: ds?.homepageUrl ?? fallbackUrl,
    licenseName: ds?.licenseName ?? "See provider terms",
    licenseUrl: ds?.licenseUrl ?? fallbackUrl,
    lastSuccessAt: ds?.lastSuccessAt?.toISOString() ?? null,
    datasetVersion: lastRun?.datasetVersion ?? null,
  };
}

function reasonOf(err: unknown): string {
  if (err instanceof Error) return `Indicator unavailable: ${err.message.slice(0, 200)}`;
  return "Indicator unavailable: upstream request failed";
}

// ---------------------------------------------------------------------------
// Comparison with reference locations — same real computations, cached.
// ---------------------------------------------------------------------------

const REFERENCE_LOCATIONS = [
  { name: "London", country: "United Kingdom", latitude: 51.5074, longitude: -0.1278 },
  { name: "New York", country: "United States", latitude: 40.7128, longitude: -74.006 },
  { name: "Singapore", country: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { name: "Cairo", country: "Egypt", latitude: 30.0444, longitude: 31.2357 },
  { name: "São Paulo", country: "Brazil", latitude: -23.5505, longitude: -46.6333 },
  { name: "Sydney", country: "Australia", latitude: -33.8688, longitude: 151.2093 },
];

export type CompareRow = {
  name: string;
  country: string | null;
  latitude: number;
  longitude: number;
  isCurrent: boolean;
  hotDaysBaseline: number | null;
  hotDaysRecent: number | null;
  trendDeltaPct: number | null;
  quakes10y: number | null;
  maxMag10y: number | null;
};

function heatNums(ind: IndicatorDTO): Pick<CompareRow, "hotDaysBaseline" | "hotDaysRecent" | "trendDeltaPct"> {
  if (!ind.available) return { hotDaysBaseline: null, hotDaysRecent: null, trendDeltaPct: null };
  const d = ind.data as HeatIndicator;
  return {
    hotDaysBaseline: d.baselineHotDaysPerYear,
    hotDaysRecent: d.recentHotDaysPerYear,
    trendDeltaPct: d.trendDeltaPct,
  };
}

function quakeNums(ind: IndicatorDTO): Pick<CompareRow, "quakes10y" | "maxMag10y"> {
  if (!ind.available) return { quakes10y: null, maxMag10y: null };
  const d = ind.data as QuakeHistory;
  return { quakes10y: d.count10y, maxMag10y: d.maxMag10y };
}

export async function buildLocationCompare(input: {
  latitude: number;
  longitude: number;
}): Promise<CompareRow[]> {
  const [curHeat, curQuake] = await Promise.all([
    buildHeatIndicator(input.latitude, input.longitude),
    buildQuakeIndicator(input.latitude, input.longitude),
  ]);

  const rows: CompareRow[] = [
    {
      name: "Selected location",
      country: null,
      latitude: round(input.latitude, 3),
      longitude: round(input.longitude, 3),
      isCurrent: true,
      ...heatNums(curHeat),
      ...quakeNums(curQuake),
    },
  ];

  for (const ref of REFERENCE_LOCATIONS) {
    const [heat, quake] = await Promise.all([
      buildHeatIndicator(ref.latitude, ref.longitude),
      buildQuakeIndicator(ref.latitude, ref.longitude),
    ]);
    rows.push({
      name: ref.name,
      country: ref.country,
      latitude: ref.latitude,
      longitude: ref.longitude,
      isCurrent: false,
      ...heatNums(heat),
      ...quakeNums(quake),
    });
  }

  return rows;
}
