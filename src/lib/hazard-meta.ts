// Static hazard-layer metadata registry.
//
// Every layer declares its source, methodology, units, resolution, license and
// limitations. A layer is rendered in the UI only when its data source is
// configured AND a validated import exists — availability is computed at
// runtime from the database, never asserted statically.

import type { LegendBin } from "@/lib/types";

export type LayerDef = {
  key: string;
  name: string;
  hazardType: string;
  kind: "observation" | "event" | "model" | "projection";
  description: string;
  units: string | null;
  methodology: string | null;
  resolution: string | null;
  temporalCoverage: string | null;
  licenseName: string | null;
  licenseUrl: string | null;
  limitations: string | null;
  sourceKey: string | null;
  colorHex: string;
  mapAvailable: boolean; // false ⇒ not rendered as a map layer (indicator-only, e.g. heat)
  statusWhenNoData: "unavailable" | "location_level";
  statusReasonNoData: string;
  legend: LegendBin[] | null;
  sortOrder: number;
};

export const EARTHQUAKE_MAGNITUDE_LEGEND: LegendBin[] = [
  { label: "M 2.5 – 3.9", color: "#fbbf24", min: 2.5, max: 4 },
  { label: "M 4.0 – 4.9", color: "#f59e0b", min: 4, max: 5 },
  { label: "M 5.0 – 5.9", color: "#d97706", min: 5, max: 6 },
  { label: "M 6.0 – 6.9", color: "#c2410c", min: 6, max: 7 },
  { label: "M ≥ 7.0", color: "#991b1b", min: 7 },
];

export const LAYER_DEFS: LayerDef[] = [
  {
    key: "earthquake",
    name: "Earthquakes",
    hazardType: "earthquake",
    kind: "observation",
    description:
      "Recorded earthquake epicentres (magnitude 2.5+) from the USGS global seismic network, refreshed from the official 30-day feed.",
    units: "moment/local magnitude (M), depth in km",
    methodology:
      "Point observations published by the USGS Earthquake Hazards Program. Magnitude and depth are taken verbatim from the feed; magnitudes may be revised by source networks after review.",
    resolution: "point (global seismic network, hypocentre projected to surface)",
    temporalCoverage: "rolling 30 days (map); 10-year catalog excerpt in location views",
    licenseName: "Public domain (U.S. Government work)",
    licenseUrl: "https://www.usgs.gov/information-policies-and-instructions",
    limitations:
      "Detection completeness decreases with magnitude and oceanic coverage; small events are missing in poorly instrumented regions. Epicentre ≠ felt impact.",
    sourceKey: "usgs-earthquakes",
    colorHex: "#d97706",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData: "Waiting for the first validated import from the USGS feed.",
    legend: EARTHQUAKE_MAGNITUDE_LEGEND,
    sortOrder: 5,
  },
  {
    key: "wildfire",
    name: "Wildfires",
    hazardType: "wildfire",
    kind: "event",
    description:
      "Documented wildfire events aggregated by NASA EONET from official agencies (e.g. FIRMS, national forestry services).",
    units: "event reports; per-event area/energy where the source provides it",
    methodology:
      "Event-level records curated by NASA's Earth Observatory Natural Event Tracker (EONET v3). Positions are representative event coordinates, not fire perimeters.",
    resolution: "point/track per event",
    temporalCoverage: "rolling 12 months of EONET records",
    licenseName: "Public domain (NASA)",
    licenseUrl: "https://eonet.gsfc.nasa.gov/api/v3",
    limitations:
      "Only events that agencies report to EONET; small or short-lived fires are under-represented. Hotspot raster layers (NASA FIRMS) require an API key and are not yet enabled.",
    sourceKey: "nasa-eonet",
    colorHex: "#ea580c",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData: "Waiting for the first validated EONET import.",
    legend: null,
    sortOrder: 10,
  },
  {
    key: "flood",
    name: "Floods",
    hazardType: "flood",
    kind: "event",
    description:
      "Documented flood events reported to NASA EONET by hydrometeorological agencies (e.g. DFO — Dartmouth Flood Observatory).",
    units: "event reports; severity where the source provides it",
    methodology: "Event-level records from EONET v3; positions are representative coordinates of the reported flood area.",
    resolution: "point per event",
    temporalCoverage: "rolling 12 months of EONET records",
    licenseName: "Public domain (NASA)",
    licenseUrl: "https://eonet.gsfc.nasa.gov/api/v3",
    limitations:
      "Flood extent modelling (e.g. WRI Aqueduct) is not yet imported; event points do not delineate inundation area and cannot certify that any specific plot is flood-free.",
    sourceKey: "nasa-eonet",
    colorHex: "#0d9488",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData: "Waiting for the first validated EONET import.",
    legend: null,
    sortOrder: 15,
  },
  {
    key: "cyclone",
    name: "Tropical cyclones & severe storms",
    hazardType: "cyclone",
    kind: "event",
    description:
      "Tropical cyclone and severe storm events from NASA EONET, with maximum sustained wind magnitude where JTWC/JMA provide it.",
    units: "maximum sustained wind (knots) where reported",
    methodology:
      "EONET v3 event tracks; the ingested position is the latest known track point, start/end dates from the event lifecycle, severity from reported wind magnitude.",
    resolution: "track point per event",
    temporalCoverage: "rolling 12 months of EONET records",
    licenseName: "Public domain (NASA)",
    licenseUrl: "https://eonet.gsfc.nasa.gov/api/v3",
    limitations: "Forecast cones and warning polygons are not included; positions can lag official advisories by hours.",
    sourceKey: "nasa-eonet",
    colorHex: "#9333ea",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData: "Waiting for the first validated EONET import.",
    legend: null,
    sortOrder: 20,
  },
  {
    key: "drought",
    name: "Drought",
    hazardType: "drought",
    kind: "event",
    description: "Documented drought episodes reported to NASA EONET (sparse — agencies report major episodes only).",
    units: "event reports",
    methodology: "EONET v3 event records; droughts are regional — coordinates are representative, not boundaries.",
    resolution: "point per event (regional episodes)",
    temporalCoverage: "rolling 12 months of EONET records",
    licenseName: "Public domain (NASA)",
    licenseUrl: "https://eonet.gsfc.nasa.gov/api/v3",
    limitations:
      "EONET drought reporting is sparse. SPI/SPEI precipitation-index modelling is not yet imported, so absence of a marker does not imply absence of drought.",
    sourceKey: "nasa-eonet",
    colorHex: "#ca8a04",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData:
      "No reliable open event feed publishes drought episodes (tested: EONET archive empty, GDACS discontinued, ReliefWeb requires registration). The layer stays unavailable rather than showing estimated data.",
    legend: null,
    sortOrder: 25,
  },
  {
    key: "landslide",
    name: "Landslides",
    hazardType: "landslide",
    kind: "event",
    description: "Documented landslide events reported to NASA EONET (largely from the NASA/CGS landslide catalog).",
    units: "event reports",
    methodology: "EONET v3 event records at reported trigger coordinates.",
    resolution: "point per event",
    temporalCoverage: "rolling 12 months of EONET records",
    licenseName: "Public domain (NASA)",
    licenseUrl: "https://eonet.gsfc.nasa.gov/api/v3",
    limitations:
      "Susceptibility modelling (slope, soil, rainfall) is not imported; catalogued events are strongly biased to populated, reported areas.",
    sourceKey: "nasa-eonet",
    colorHex: "#854d0e",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData:
      "No reliable open event feed publishes landslides (EONET archive has none; major aggregators require registration). Susceptibility modelling is not yet imported.",
    legend: null,
    sortOrder: 30,
  },
  {
    key: "volcano",
    name: "Volcanic activity",
    hazardType: "volcano",
    kind: "event",
    description: "Eruptive activity reported to NASA EONET from Smithsonian GVP and volcano observatories.",
    units: "event reports; plume elevation where reported",
    methodology: "EONET v3 event records at volcano coordinates.",
    resolution: "point per event",
    temporalCoverage: "rolling 12 months of EONET records",
    licenseName: "Public domain (NASA)",
    licenseUrl: "https://eonet.gsfc.nasa.gov/api/v3",
    limitations: "Ash cloud advisories (VAAC) are not included.",
    sourceKey: "nasa-eonet",
    colorHex: "#b91c1c",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData: "Waiting for the first validated EONET import.",
    legend: null,
    sortOrder: 35,
  },
  {
    key: "extreme_heat",
    name: "Extreme heat",
    hazardType: "extreme_heat",
    kind: "observation",
    description:
      "Heat-stress indicators computed per searched location from the ERA5 reanalysis: hot days per year (Tmax ≥ 35 °C, auto-scaled in cool climates) and decadal trends.",
    units: "days/year above threshold; °C",
    methodology:
      "Daily maximum temperature 1995–2024 from Open-Meteo ERA5 Archive (Copernicus/ECMWF ERA5). Hot-day threshold 35 °C, lowered where the local 95th percentile Tmax is lower; trend compares the last 5 years against the 1995–2024 mean.",
    resolution: "≈ 25–31 km reanalysis grid cell (not street-level)",
    temporalCoverage: "1995 – present (reanalysis has ~5 day latency)",
    licenseName: "CC-BY 4.0 (Open-Meteo / Copernicus ERA5)",
    licenseUrl: "https://open-meteo.com/en/license",
    limitations:
      "Reanalysis grid cells average over wide areas — unsuitable for intra-urban heat islands. Computed on demand per location; no global gridded map import is configured, so this is not shown as a map layer.",
    sourceKey: "openmeteo-era5",
    colorHex: "#dc2626",
    mapAvailable: false,
    statusWhenNoData: "location_level",
    statusReasonNoData: "Location-level indicator only (computed from ERA5 on demand).",
    legend: null,
    sortOrder: 40,
  },
  {
    key: "air_quality",
    name: "Air quality (PM2.5)",
    hazardType: "air_quality",
    kind: "observation",
    description:
      "Recent PM2.5 concentrations for searched locations from the Copernicus Atmosphere Monitoring Service via Open-Meteo.",
    units: "μg/m³ (PM2.5, 72-hour hourly series)",
    methodology:
      "CAMS global atmospheric composition forecasts/analyses via the Open-Meteo Air Quality API. WHO 24-hour guideline: 15 μg/m³.",
    resolution: "≈ 40 km CAMS grid cell",
    temporalCoverage: "past 72 hours + next 24 h",
    licenseName: "CC-BY 4.0 (Open-Meteo / CAMS)",
    licenseUrl: "https://open-meteo.com/en/license",
    limitations:
      "Model output, not ground sensors — local pollution hotspots (roads, industry) are not resolved. No global map import configured; shown per location only.",
    sourceKey: "openmeteo-cams",
    colorHex: "#4d7c0f",
    mapAvailable: false,
    statusWhenNoData: "location_level",
    statusReasonNoData: "Location-level indicator only (computed from CAMS on demand).",
    legend: null,
    sortOrder: 45,
  },
  {
    key: "wind",
    name: "Wind & gusts",
    hazardType: "wind",
    kind: "observation",
    description:
      "Near-surface wind speed and gusts across the globe — the same quantity Windy.com renders as its wind layer — sampled from the ECMWF/GFS forecast models on a fixed 10° grid.",
    units: "wind speed & gusts (km/h); direction (°); Beaufort force",
    methodology:
      "Hourly wind_speed_10m, wind_gusts_10m and wind_direction_10m from the Open-Meteo Weather Forecast API (ECMWF IFS + NOAA GFS blend, CC-BY 4.0), sampled at a fixed 10° latitude/longitude grid (540 sample points, 60°S–80°N). The current-conditions snapshot is refreshed every 3 h; each grid point stores its latest value. Beaufort force labels are derived from wind speed per the Beaufort scale.",
    resolution: "10° sample grid of an ~11 km native model (point samples, not a continuous wind field)",
    temporalCoverage: "current conditions (refreshed every 3 h); 30-year wind climatology in location views",
    licenseName: "CC-BY 4.0 (Open-Meteo / ECMWF–GFS)",
    licenseUrl: "https://open-meteo.com/en/license",
    limitations:
      "Model output, not station measurements — a 10° grid cannot resolve terrain channelling, gap winds, thermally driven local winds or tropical-cyclone eyewall maxima. Point samples sit ~100–700 km apart; conditions between sample points differ. For a specific place use the location view, which queries the model directly at that coordinate.",
    sourceKey: "openmeteo-wind",
    colorHex: "#059669",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData: "Waiting for the first validated wind-grid import.",
    legend: [
      { label: "< 12 km/h — light (B0–2)", color: "#86b57f", max: 12 },
      { label: "12–19 km/h — gentle breeze (B3)", color: "#65a30d", min: 12, max: 20 },
      { label: "20–28 km/h — moderate breeze (B4)", color: "#ca8a04", min: 20, max: 29 },
      { label: "29–38 km/h — fresh breeze (B5)", color: "#ea580c", min: 29, max: 39 },
      { label: "39–61 km/h — strong → near gale (B6–7)", color: "#dc2626", min: 39, max: 62 },
      { label: "62–88 km/h — gale → strong gale (B8–9)", color: "#7e22ce", min: 62, max: 89 },
      { label: "≥ 89 km/h — storm force (B10+)", color: "#581c87", min: 89 },
    ],
    sortOrder: 48,
  },
  {
    key: "waves",
    name: "Ocean waves",
    hazardType: "waves",
    kind: "observation",
    description:
      "Current significant wave height across the global oceans — the same quantity Windy renders as its Waves layer — sampled from the ECMWF WAM model on a fixed 10° ocean grid.",
    units: "significant wave height (m); sea-state label per the Douglas scale",
    methodology:
      "ECMWF WAM wave model via the Open-Meteo Marine API (CC-BY 4.0), sampled at a fixed 10° latitude/longitude ocean grid (468 sample points, land cells skipped). Current-conditions snapshot refreshed every 6 h; each grid point stores its latest value. Sea-state labels (calm → phenomenal) are derived from height per the Douglas scale.",
    resolution: "10° sample grid of a ~25 km native model (not buoy measurements)",
    temporalCoverage: "current conditions (refreshed every 6 h)",
    licenseName: "CC-BY 4.0 (Open-Meteo / ECMWF WAM)",
    licenseUrl: "https://open-meteo.com/en/license",
    limitations:
      "Model output, not buoy measurements — coastal sheltering, bathymetry and surf-zone effects are not resolved. A 10° grid cannot capture local sea-state extremes between sample points.",
    sourceKey: "openmeteo-marine",
    colorHex: "#0f766e",
    mapAvailable: true,
    statusWhenNoData: "unavailable",
    statusReasonNoData: "Waiting for the first validated marine-grid import.",
    legend: [
      { label: "< 0.5 m — calm", color: "#5eead4", max: 0.5 },
      { label: "0.5 – 1.25 m — slight", color: "#2dd4bf", min: 0.5, max: 1.25 },
      { label: "1.25 – 2.5 m — moderate", color: "#14b8a6", min: 1.25, max: 2.5 },
      { label: "2.5 – 4 m — rough", color: "#0d9488", min: 2.5, max: 4 },
      { label: "4 – 6 m — very rough", color: "#0f766e", min: 4, max: 6 },
      { label: "6 – 9 m — high", color: "#115e59", min: 6, max: 9 },
      { label: "≥ 9 m — phenomenal", color: "#134e4a", min: 9 },
    ],
    sortOrder: 50,
  },
];

export const LAYER_DEF_BY_KEY = new Map(LAYER_DEFS.map((l) => [l.key, l]));

// ---------------------------------------------------------------------------
// Beaufort wind scale — labels are derived only from the reported wind speed,
// never asserted independently.
// ---------------------------------------------------------------------------
const BEAUFORT_BANDS: { maxKmh: number; b: number; name: string }[] = [
  { maxKmh: 1, b: 0, name: "calm" },
  { maxKmh: 5, b: 1, name: "light air" },
  { maxKmh: 11, b: 2, name: "light breeze" },
  { maxKmh: 19, b: 3, name: "gentle breeze" },
  { maxKmh: 28, b: 4, name: "moderate breeze" },
  { maxKmh: 38, b: 5, name: "fresh breeze" },
  { maxKmh: 49, b: 6, name: "strong breeze" },
  { maxKmh: 61, b: 7, name: "near gale" },
  { maxKmh: 74, b: 8, name: "gale" },
  { maxKmh: 88, b: 9, name: "strong gale" },
  { maxKmh: 102, b: 10, name: "storm" },
  { maxKmh: 117, b: 11, name: "violent storm" },
  { maxKmh: Number.POSITIVE_INFINITY, b: 12, name: "hurricane force" },
];

export function beaufortOf(kmh: number): { b: number; name: string } {
  if (!Number.isFinite(kmh) || kmh < 0) return { b: 0, name: "calm" };
  return BEAUFORT_BANDS.find((band) => kmh <= band.maxKmh) ?? BEAUFORT_BANDS[BEAUFORT_BANDS.length - 1];
}

export function compassOf(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return points[idx];
}

export const PM25_CATEGORIES: { label: string; max: number; color: string }[] = [
  { label: "Good", max: 10, color: "#65a30d" },
  { label: "Moderate", max: 25, color: "#ca8a04" },
  { label: "Unhealthy (sensitive)", max: 50, color: "#ea580c" },
  { label: "Unhealthy", max: 100, color: "#dc2626" },
  { label: "Very unhealthy", max: 300, color: "#991b1b" },
  { label: "Extreme", max: Number.POSITIVE_INFINITY, color: "#701a1a" },
];

export function pm25Category(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return null;
  return PM25_CATEGORIES.find((c) => v <= c.max) ?? PM25_CATEGORIES[PM25_CATEGORIES.length - 1];
}
