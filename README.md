<div align="center">

# 🌍 WorldRisk Atlas

**A free, open-source map of environmental hazards and documented disaster
events — built only on real, cited data.**

Explore earthquakes, wildfires, floods, tropical cyclones, droughts,
landslides and volcanic activity on a live global map, inspect any location's
seismic history, extreme-heat profile and air quality, and read the
methodology, license and limitations behind every number.

*No fabricated risk scores · no invented events · no arbitrary red/green zones.*

</div>

---

## ✨ What it does

| | |
|---|---|
| 🗺️ **Interactive global map** | MapLibre GL with a neutral Positron/dark vector basemap, magnitude-scaled earthquake circles, halos on active events, rich popups, "tap anywhere to inspect", responsive to 390 px |
| 🧭 **Location intelligence** | Search any city/region/coordinate → seismic history (M ≥ 4.5 within 300 km, 10 y), extreme-heat profile (hot days/yr since 1995 with decadal trend), PM2.5 (72 h), nearby documented events, reference-city comparison — each with source, license and limitations |
| 🗂️ **Hazard layers** | 9 layers with per-layer methodology, units, resolution, temporal coverage and license. A layer is only shown as **live** once its source is configured *and* a validated import exists — otherwise it says exactly why it is unavailable |
| 📰 **Disaster events** | Documented events (separate from hazard observations): title, type, dates, severity *only when the source reports it*, original source link, verification status (`source_reported` / `cross_verified`) |
| 🔄 **Automatic data pipeline** | Self-scheduling in-app ingestion: schema-validated, deduplicated on provider IDs, upsert-only (failed imports never overwrite valid data), full per-run audit trail, retries with jittered backoff, auto-pause after repeated failures, auto-resume |
| 🧪 **Honesty by design** | Missing/uncertain data is *labelled*, never filled in. Country-level data never claims street-level safety. |

## 📡 Data sources & licenses (the important part)

WorldRisk Atlas aggregates **open data only**. Every record traces back to a
registered source; attribution is shown in the app (footer, location panels,
**Data & Sources** page) and below.

| Source | Used for | License | Link |
|---|---|---|---|
| **U.S. Geological Survey** — Earthquake Hazards Program | earthquake layer (M2.5+ 30-day feed), 10-year seismic history (FDSN API) | Public domain (U.S. Government work) | <https://earthquake.usgs.gov> |
| **NASA EONET v3** — Earth Observatory Natural Event Tracker | documented wildfire / flood / cyclone events + 5-year volcano category archive (222 events) | Public domain (NASA) | <https://eonet.gsfc.nasa.gov/api/v3> |
| **Open-Meteo** — ERA5 Historical Archive (Copernicus C3S / ECMWF) | extreme-heat profile (daily Tmax, hot days/yr, climatology, trend) | CC-BY 4.0 | <https://open-meteo.com/en/docs/historical-weather-api> |
| **Open-Meteo** — Air Quality (Copernicus **CAMS**) | PM2.5 indicator (72 h) | CC-BY 4.0 | <https://open-meteo.com/en/docs/air-quality-api> |
| **Open-Meteo** — Geocoding (GeoNames) | location search | CC-BY 4.0 (GeoNames data) | <https://open-meteo.com/en/docs/geocoding-api> |
| **Open-Meteo** — Marine API (ECMWF WAM) | Ocean waves layer — significant wave height on a 10° global ocean grid (468 sample points) | CC-BY 4.0 | <https://open-meteo.com/en/docs/marine-weather-api> |
| **OpenStreetMap** — Nominatim | reverse geocoding (map-click naming; ≤1 req/s per OSMF policy, 24 h cache) | ODbL 1.0 © OpenStreetMap contributors | <https://nominatim.openstreetmap.org> |
| **OpenFreeMap / OpenMapTiles** | neutral vector basemap (Positron & dark) | Free, no API key — © OpenStreetMap contributors | <https://openfreemap.org> |
| **ReliefWeb Disasters API v2** (UN OCHA) | richer event metadata | Reusable with attribution to the original source — *disabled until an approved `appname` is configured* | <https://apidoc.reliefweb.int> |
| **NASA FIRMS** (VIIRS/Suomi-NPP) | active fire hotspots (planned, per-viewport) | Public domain — *disabled until a free MAP_KEY is configured* | <https://firms.modaps.eosdis.nasa.gov> |

> **Honest gaps.** Drought and landslide layers are deliberately **unavailable**: we tested six candidate feeds (EONET archive, GDACS, Smithsonian GVP, US Drought Monitor, ReliefWeb, NASA FIRMS) and none currently offers a reliable open event stream for them — the layers say so instead of showing estimated data. Volcanic activity uses EONET's 5-year category archive; live USGS alert levels were evaluated but the public HANS API lacks coordinates.
>
> **License note.** Platform code is MIT (see [`LICENSE`](LICENSE)). The **data**
> keeps its provider licenses — redistributing extracted data is subject to
> those terms, not MIT.

### Sources that need free credentials

ReliefWeb and NASA FIRMS are registered in the source catalog but stay in an
honest **needs_config** state until their free credentials exist
(`RELIEFWEB_APPNAME`, `FIRMS_MAP_KEY`). Nothing is fabricated for them, and the
affected layers remain live through the sources above (e.g. wildfire events
still stream via EONET).

## 🚀 Getting started

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.1 (or Node ≥ 20), Python 3 (only
if you want the optional standalone worker).

```bash
git clone <your-fork-url> worldrisk-atlas
cd worldrisk-atlas
bun install

# configure (all keys optional — the app runs without any of them)
cp .env.example .env

# create the database schema
bun run db:push

# run
bun run dev            # → http://localhost:3000
```

The app **bootstraps itself**: on first visit (and at every server start) the
built-in scheduler seeds the source registry and imports USGS + NASA EONET.
Within a minute the map is fully live.

### Keeping data up to date (automatic)

| Mechanism | Detail |
|---|---|
| **In-app scheduler** (default) | Started by `src/instrumentation.ts` on server boot. Every 15 min it imports each bulk source whose cadence window has elapsed (USGS every 3 h, EONET every 6 h). Disable with `INGEST_SCHEDULER=0`. |
| **Standalone worker** (alternative) | `python3 workers/ingest-worker.py` — stdlib-only poller that calls the ingest API on a fixed interval (`INGEST_INTERVAL_MIN`, `ADMIN_TOKEN` aware). |
| **Cron** (production) | `POST /api/admin/ingest` (or `php yii ingest/run` for the Yii2 backend) on your own schedule. |

Every import is auditable: `GET /api/admin/runs` returns the full history
(fetched / inserted / updated / skipped / invalid counts, dataset version,
duration, errors).

## 🧱 Architecture

```
┌────────────────────────── Next.js 16 (App Router, TS) ──────────────────────────┐
│  UI: MapLibre GL map · layer panel · location panels · Recharts · shadcn/ui     │
│  API: /api/layers /observations /events /locations /corrections /admin/ingest   │
│       ↕ Zod-validated contracts on BOTH sides                                   │
│  Ingestion: source registry → SSRF-guarded fetch → schema validation →          │
│             dedup (provider IDs) → upsert → audit trail → auto-pause/resume     │
│  Scheduler: instrumentation.ts → cadence-driven ticks (or worker/cron)          │
└────────────┬───────────────────────────────────────────────────────────┬────────┘
             │ Prisma                                                    │ HTTPS
      ┌──────▼──────┐                                    ┌───────────────▼───────────────┐
      │ SQLite (MVP)│  or  PostgreSQL 15 + PostGIS 3     │ USGS · NASA EONET · Open-Meteo│
      └─────────────┘      (production schema: docs/)    │ Nominatim · OpenFreeMap · …   │
                                                         └───────────────────────────────┘
```

**Two backends ship in this repository:**

| | Path | Runtime | Status |
|---|---|---|---|
| MVP REST API | `src/app/api/**` | Node (Next.js route handlers) + SQLite via Prisma | ✅ verified end-to-end with live data |
| Production backend | `backend-yii2/` + `docs/schema-postgis.sql` | PHP 8.2 (Yii2) + PostgreSQL/PostGIS | ✅ complete code, ⚠️ not executed here (no PHP in the build sandbox) — smoke-test checklist in its README |

Both implement the **same JSON contract** (`docs/API.md`), so switching is a
base-URL change.

## 📁 Repository layout

```
src/app/                    # app shell (single-page atlas) + REST API routes
src/components/atlas/       # map, layers, location panel, events, data & sources
src/lib/ingest/             # source registry · adapters (USGS, EONET, ReliefWeb)
                            # runner (retries, dedup, audit, auto-pause) · scheduler
src/lib/services/           # location intelligence (Nominatim, FDSN, ERA5, CAMS)
src/lib/                    # zod contracts · SSRF-guarded fetch · TTL cache · geo utils
prisma/schema.prisma        # data model (SQLite twin of the PostGIS schema)
docs/schema-postgis.sql     # production PostGIS DDL (mirrors the Prisma model)
workers/ingest-worker.py    # standalone scheduled ingestion worker (stdlib only)
backend-yii2/               # production Yii2 + PostGIS backend
docs/                       # API.md · DATA_SOURCES.md · TESTING.md
```

## 📖 Documentation

- [`docs/API.md`](docs/API.md) — every endpoint, DTO shape and validation contract
- [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) — per-source licensing & attribution detail
- [`docs/TESTING.md`](docs/TESTING.md) — what was verified live + the test plan
- [`backend-yii2/README.md`](backend-yii2/README.md) — production backend setup & contract table

## 🛠️ Built with open-source software

[Next.js 16](https://nextjs.org) · [React 19](https://react.dev) ·
[TypeScript](https://typescriptlang.org) · [MapLibre GL JS](https://maplibre.org) ·
[Tailwind CSS 4](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) ·
[Recharts](https://recharts.org) · [TanStack Query](https://tanstack.com/query) ·
[Zustand](https://zustand.docs.pmnd.rs) · [Zod](https://zod.dev) ·
[Prisma](https://prisma.io) · [Lucide](https://lucide.dev) ·
[Yii2](https://www.yiiframework.com) · [PostGIS](https://postgis.net) —
thank you to every maintainer. 💚

## 🔐 Responsibility & intended use

Indicators are **area-level estimates** (25–40 km grid cells, 300 km catalog
windows). They describe surroundings, not specific addresses, and must never
replace official warnings, building codes or professional due diligence. See
the in-app **Data & Sources** page for the full disclaimer set.

## 🗺️ Roadmap

- [ ] NASA FIRMS hotspot layer (per-viewport queries) — pending free MAP_KEY
- [ ] ReliefWeb event enrichment — pending approved appname
- [ ] Flood extent / cyclone forecast-cone datasets (WRI Aqueduct, official advisories)
- [ ] Saved-location alerts & premium report exports (schema hooks already present)
- [ ] Metered business API (bbox queries already supported server-side)

## 🤝 Contributing

Issues and PRs are welcome. Please keep the core promise of the project:
**never invent data** — new layers must bring a documented, licensed source, a
validated adapter and honest unavailable-states.

## 📄 License

Code: [MIT](LICENSE). Data: respective provider licenses (see
[Data sources](#-data-sources--licenses-the-important-part) and
[NOTICE section in LICENSE](LICENSE#L20)).

<div align="center">
<sub>Built with real data from USGS, NASA, Copernicus/ECMWF, GeoNames and OpenStreetMap contributors.</sub>
</div>
