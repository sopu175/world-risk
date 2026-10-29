# WorldRisk Atlas

A production-oriented **global environmental & disaster risk intelligence
platform**: an interactive map where you explore evidence-based hazards and
documented disaster events by country, region and city — with methodology,
licenses, data-quality limitations and last-updated dates attached to every
indicator. **No fake risk scores, no fabricated events, no arbitrary
red/green zones.**

![stack](https://img.shields.io/badge/Next.js-16-black) ![map](https://img.shields.io/badge/MapLibre_GL-5-teal) ![data](https://img.shields.io/badge/USGS%20·%20NASA%20·%20Copernicus-live-brightgreen)

## What actually runs here

This engagement ran in a sandbox with **one exposed port and no PHP/PostgreSQL
runtime**. The delivered system therefore has two parts:

| Part | Location | Status |
| --- | --- | --- |
| **Runnable MVP** — Next.js 16 full-stack app (UI + REST API + SQLite/Prisma + ingestion + scheduled Python worker) | `src/`, `workers/`, `prisma/` | ✅ built, **live-verified end-to-end** with real data |
| **Production backend target** — Yii2 (PHP) REST API + PostgreSQL 15/PostGIS 3 schema, identical contract | `backend-yii2/`, `docs/schema-postgis.sql` | ✅ complete code, ⚠️ **not executable in this sandbox** (no PHP/PG) — see its README |

The MVP implements the exact REST contract documented in `docs/API.md`; the
Yii2 backend implements the same contract for production deployment. Swapping
the sandbox API for the Yii2 backend requires no frontend changes beyond the
base URL.

## Live data sources (all verified reachable during this build)

| Source | Powers | License |
| --- | --- | --- |
| USGS Earthquake Hazards Program | earthquake layer (M2.5+ 30-day feed), 10-year seismic history | Public domain |
| NASA EONET v3 | documented wildfire / flood / cyclone / drought / landslide / volcano events | Public domain |
| Open-Meteo (ERA5 · CAMS · GeoNames) | extreme-heat profile, PM2.5, geocoding | CC-BY 4.0 |
| OSM Nominatim · OpenFreeMap | reverse geocoding · neutral basemap | ODbL · © OSM contributors |

ReliefWeb (needs approved appname) and NASA FIRMS (needs free MAP_KEY) are
**registered but honestly disabled** (`needs_config`) until credentials exist —
the platform never fabricates data for unconfigured sources. Details:
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## Features

- **Interactive global map** — MapLibre GL, neutral Positron/dark vector
  basemap, zoom/pan, coordinate + city/region search, magnitude-scaled
  earthquake circles, halos on active events, rich popups, "tap anywhere to
  inspect", loading/empty/error states, responsive down to 390 px.
- **Extensible hazard layers** — 9 layers with per-layer source, methodology,
  units, resolution, temporal coverage, license and limitations. A layer is
  only toggleable once its source is configured **and** a validated import
  exists; unavailable layers state exactly why.
- **Location intelligence** — geographic overview, earthquake history (M≥4.5
  within 300 km, 10 y), extreme-heat profile (hot-days/yr 1995–present with
  auto-scaled threshold + decadal trend), PM2.5 (72 h), nearby documented
  events, reference-city comparison, Recharts trends, full source citations,
  disclaimers (area-level estimates — never street-level safety).
- **Disaster events system** — separate from hazard observations: title, type,
  kind (historical/active), dates, severity *only when the source provides it*,
  source name + URL, verification status (`source_reported`/`cross_verified`),
  correction reporting.
- **Ingestion pipeline** — schema-validated (Zod server-side, Zod again on the
  client), coordinate-validated, dedup on provider-native IDs, upsert-only
  (failed imports never overwrite valid data), per-run audit trail
  (fetched/inserted/updated/skipped/invalid, dataset version, duration,
  errors), retries with jittered backoff, auto-disable after 5 consecutive
  failures, admin enable/disable, SSRF-guarded allow-listed fetching.
- **Admin dashboard** — source registry with freshness + status, import
  history, per-layer coverage stats, failed-run monitoring, corrections queue.
- **Monetization-ready** — free tier MVP; saved locations + entitlements
  extension points and a documented premium roadmap (reports, alerts, business
  API, portfolio monitoring, bulk exports) in the Methodology page.

## Quick start (sandbox MVP)

```bash
bun install
cp .env.example .env      # optional keys: ADMIN_TOKEN, RELIEFWEB_APPNAME, FIRMS_MAP_KEY
bun run db:push           # SQLite schema
bun run dev               # http://localhost:3000
# scheduled ingestion (optional; the app also bootstraps itself on first visit)
python3 workers/ingest-worker.py
```

First visit triggers `POST /api/ingest/bootstrap` (idempotent): it seeds the
registry and imports USGS + EONET, after which the map is fully live.

## REST API

Full contract: [`docs/API.md`](docs/API.md) (also implemented by the Yii2
backend at `/v1/*`).

## Project layout

```
src/app/api/…            REST API (layers, observations, events, locations,
                         corrections, saved-locations, admin, ingest)
src/lib/ingest/          source registry, adapters (USGS/EONET/ReliefWeb), runner
src/lib/services/        location intelligence (Nominatim, FDSN, ERA5, CAMS)
src/components/atlas/    map, layer panel, location panel, events, admin, methodology
prisma/schema.prisma     SQLite data model (PostGIS twin: docs/schema-postgis.sql)
workers/ingest-worker.py scheduled ingestion worker (stdlib-only)
backend-yii2/            production Yii2 + PostGIS backend (see its README)
docs/                    API.md · DATA_SOURCES.md · TESTING.md · schema-postgis.sql
```

## Engineering standards applied

Separation of UI / API services / data models / ingestion logic · reusable
components (shadcn/ui) · robust error handling with per-indicator failure
isolation · loading & empty states everywhere · accessibility (semantic HTML,
ARIA labels, keyboard-reachable controls, 44 px touch targets) · secrets via
environment only (`.env.example` documents every variable) · migrations for
both stacks · SSRF prevention (HTTPS-only, host allow-list, bounded
time/payload) · no invented endpoints, credentials or datasets · upstream
licensing verified and attributed.

## Honest limitations

1. `backend-yii2/` is unexecuted (no PHP/PG in sandbox) — see its README's
   smoke-test table before production use.
2. ReliefWeb + FIRMS disabled pending free credentials.
3. Heat/air-quality indicators are location-level only (no global gridded map
   import yet — layers state this instead of pretending).
4. In-process TTL caching is per-instance; swap `TtlCache` for Redis at scale.
5. No automated tests committed (engagement constraint) — verification record
   and the ready-to-implement plan are in [`docs/TESTING.md`](docs/TESTING.md).
