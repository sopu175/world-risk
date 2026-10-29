# Data sources, licensing & attribution

Every row of data in WorldRisk Atlas traces back to a registered source. The
registry is seeded from `src/lib/ingest/sources.ts` (sandbox) /
`console/components/ingest/SourceRegistry.php` (production backend) and is
documented user-facing in the app's **Data & Sources** page; the ingestion
audit trail is public at `GET /api/ingest/runs`.

| # | Source | Used for | Access | License | Attribution required |
|---|--------|----------|--------|---------|----------------------|
| 1 | USGS Earthquake Hazards Program — [feeds](https://earthquake.usgs.gov/earthquakes/feed/) & [FDSN API](https://earthquake.usgs.gov/fdsnws/event/1/) | earthquake map layer; 10-year location seismic history | bulk 3 h + on demand | **Public domain** (U.S. Government work) | Appreciated, not legally required — we cite USGS per policy |
| 2 | [NASA EONET v3](https://eonet.gsfc.nasa.gov/api/v3) | documented events: wildfire, flood, cyclone/severe storm, drought, landslide, volcano | bulk 6 h | **Public domain** (NASA) | "NASA EONET" + original agency (JTWC, DFO, GVP…) |
| 3 | [Open-Meteo ERA5 Archive](https://open-meteo.com/en/docs/historical-weather-api) (ECMWF ERA5 via Copernicus C3S) | extreme-heat indicator (hot days/yr, climatology, trend); wind climatology (annual max wind, strong-wind days) | on demand | **CC-BY 4.0** | "Open-Meteo / Copernicus ERA5" |
| 3b | [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) (ECMWF WAM) | **Ocean waves layer** — significant wave height, 10° global ocean grid (468 sample points, land cells skipped), Douglas sea-state labels | bulk 6 h (upsert snapshot) | **CC-BY 4.0** | "Open-Meteo / ECMWF WAM" |
| 3c | [Open-Meteo Weather Forecast API](https://open-meteo.com/en/docs) (ECMWF IFS / NOAA GFS) | **Wind & gusts layer** — 10 m wind speed, gusts, direction, 10° global grid (540 sample points, 60°S–80°N, land + ocean), Beaufort labels; current wind in location views | bulk 3 h (upsert snapshot) | **CC-BY 4.0** | "Open-Meteo / ECMWF–NOAA" |
| 4 | [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) (CAMS) | PM2.5 indicator | on demand | **CC-BY 4.0** | "Open-Meteo / CAMS" |
| 5 | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) (GeoNames) | location search | on demand | **CC-BY 4.0** (GeoNames data) | "Open-Meteo / GeoNames" |
| 6 | [OSM Nominatim](https://nominatim.openstreetmap.org/) | reverse geocoding (map-click naming) | on demand, **≤1 req/s**, 24 h cache per OSMF policy | **ODbL 1.0** © OpenStreetMap contributors | Required |
| 7 | [OpenFreeMap](https://openfreemap.org/) + OpenMapTiles | neutral basemap (Positron / dark) | tile CDN | Free, no key; © OpenStreetMap contributors | Required (shown on map) |
| 8 | [ReliefWeb Disasters v2](https://apidoc.reliefweb.int/) (UN OCHA) | richer event metadata | bulk 6 h | Reusable **with attribution to the original source** | **needs_config** — requires an approved `appname` (free registration) |
| 9 | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (VIIRS/S-NPP) | active fire hotspots (planned: per-viewport queries) | bulk 6 h | Public domain; cite FIRMS/NASA | **needs_config** — requires free MAP_KEY; adapter ships only after validation |

## Registration-required sources (honest states)

ReliefWeb and FIRMS are **registered in the catalog but disabled until their
free credentials are provided** via `RELIEFWEB_APPNAME` / `FIRMS_MAP_KEY`. The
platform never fabricates data for unconfigured sources — their layers show
`needs_config` with the exact reason, and the affected hazard layers remain
covered by the sources that *are* live (e.g. wildfire events from EONET).

## Verification statuses (events)

- `cross_verified` — corroborated by **≥2 official sources** in the upstream feed
- `source_reported` — published by one official aggregator; not independently confirmed
- `unverified` — present in the feed without attributable official source

## Redistribution compliance

- We republish **source metadata and derived indicators**, always with source
  links and licenses; users are pointed to original sources for critical use.
- ERA5/CAMS/GeoNames are CC-BY 4.0 → attribution is provided in the UI
  (location panel Sources tab + footer + Methodology page).
- ODbL (Nominatim) attribution shown; no derived "database" is exposed for
  download in the MVP — bulk export (premium roadmap) will carry full ODbL
  share-alike handling review before release.

## What we deliberately do NOT do

- No scraped or invented severity scores; severity fields appear only when the
  source provides them (e.g. cyclone wind kts → Saffir-Simpson-style label,
  wildfire burned-area hectares as reported).
- No synthetic "risk scores" or red/green country shading — indicators are
  shown with methodology, resolution and limitations attached.
