# WorldRisk Atlas — Production Backend (Yii2 + PostgreSQL/PostGIS)

This directory contains the **production REST API backend** for WorldRisk Atlas,
implemented with **Yii2 (PHP ≥ 8.1)** and **PostgreSQL 15 + PostGIS 3**, serving
the exact same JSON contract as the sandbox MVP that runs in `src/app/api/*`.

> **Sandbox note (honest limitation).** The build sandbox used to develop this
> project has no PHP runtime and no PostgreSQL, so this backend could not be
> *executed or verified here*. It was written conservatively (PHP 8.1, no
> exotic syntax) against the **proven, live-verified contract** of the sandbox
> MVP — the same DTO shapes, the same ingestion semantics, the same error
> envelopes. Before production use: run `composer install`, run the migration,
> and smoke-test each endpoint (the contract table below doubles as a test
> script). Known-verification status of every other part of the system is
> listed in the repository root README.

---

## Architecture

```
browser ──▶ Next.js frontend (sandbox MVP)
        ──▶ this Yii2 API (production)  ──▶ PostgreSQL 15 + PostGIS 3
                    │
                    └──▶ ingestion workers (php yii ingest/run via cron)
                              ├── USGS Earthquake feed (public domain)
                              ├── NASA EONET v3 (public domain)
                              └── ReliefWeb v2 (needs RELIEFWEB_APPNAME)
```

- **Layer availability is computed, never asserted**: a layer is `live` only
  once a validated import exists (`hazard_layer.available` is set by adapters
  after a successful, schema-validated import).
- **Dedup**: provider-native IDs (`(source_id, external_id)` unique keys).
  Only genuinely new rows are inserted; only revised rows are updated; the
  rest are counted as skipped. Existing valid data is never deleted.
- **Audit trail**: every import attempt writes an `ingestion_run` row with
  counts, dataset version, duration and errors. Sources auto-disable after
  **5** consecutive failed imports; administrators re-enable them.
- **SSRF protection**: all outbound HTTP goes through
  `api/modules/v1/support/Upstream.php` — HTTPS-only, host allow-list, bounded
  timeouts/payloads, identifying User-Agent, IPv4-pinned transport.

## Setup

```bash
# 1. Database (once)
sudo -u postgres psql -c "CREATE ROLE worldrisk LOGIN PASSWORD '…';"
sudo -u postgres psql -c "CREATE DATABASE worldrisk_atlas OWNER worldrisk;"
# postgis + pg_trgm extensions are created by the migration itself.

# 2. Application
cd backend-yii2
composer install
cp .env.example .env          # then edit credentials
php yii migrate --interactive=0
php yii ingest/bootstrap       # seeds registry, first import
php yii serve                  # dev server; production: nginx + php-fpm
```

### Environment variables (`.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_DSN` | ✅ | e.g. `pgsql:host=127.0.0.1;port=5432;dbname=worldrisk_atlas` |
| `DATABASE_USER` / `DATABASE_PASSWORD` | ✅ | DB credentials |
| `ADMIN_TOKEN` | recommended | When set, `/v1/admin/*` requires `x-admin-token`; unset = open mode (dev only) |
| `RELIEFWEB_APPNAME` | optional | Approved appname for ReliefWeb v2 (register at apidoc.reliefweb.int) |
| `FIRMS_MAP_KEY` | optional | NASA FIRMS MAP_KEY (register free) — required before the wildfire hotspot adapter ships |
| `APP_USER_AGENT` | optional | Overrides `WorldRiskAtlas/0.1` UA sent upstream |

### Scheduling

```cron
# USGS feed refreshes every 3 h; EONET every 6 h — one shared hourly pass is fine
0 * * * * cd /var/www/worldrisk-atlas && php yii ingest/run >> runtime/ingest.log 2>&1
```

## REST contract (`/v1`)

Success envelope `{ "data": … }`; failure envelope
`{ "error": { "code": "…", "message": "…" } }` with proper HTTP status codes.

| Method & path | Purpose |
| --- | --- |
| `GET /v1/layers` | Layer registry with computed `status` (`live`/`needs_config`/`unavailable`/`location_level`), record counts, legends |
| `GET /v1/observations?layer=&bbox=&limit=&minMagnitude=` | Point observations (earthquakes); `bbox=west,south,east,north` |
| `GET /v1/events?type=&kind=&bbox=&days=&limit=` | Documented disaster events |
| `GET /v1/events/summary` | Counts by type + active counts + coverage window |
| `GET /v1/locations/search?q=&count=` | Forward geocoding (Open-Meteo/GeoNames) |
| `POST /v1/locations/detail` `{latitude,longitude,name?,country?,countryCode?}` | Full profile: reverse geocode, timezone/elevation, quake history, extreme-heat profile (ERA5), PM2.5 (CAMS), nearby events, disclaimers |
| `POST /v1/locations/compare` `{latitude,longitude}` | Same-methodology comparison vs 6 reference cities |
| `POST /v1/corrections` `{targetType,message,…}` | User-submitted data corrections (201) |
| `GET/POST/DELETE /v1/saved-locations` | Session-scoped saved locations (monetization extension point) |
| `GET /v1/admin/overview` | Stats, sources, recent runs, coverage, corrections queue |
| `PATCH /v1/admin/sources` `{key,enabled?,notes?}` | Enable/disable a source (resetting the failure counter) |
| `POST /v1/admin/ingest` `{sources?,trigger?}` | Trigger ingestion now |
| `GET /v1/admin/runs?limit=` | Ingestion run history |
| `PATCH /v1/admin/corrections` `{id,status,adminNote?}` | Resolve/reject corrections |

## Data sources & licensing

| Source | License | Notes |
| --- | --- | --- |
| USGS Earthquake Hazards Program | Public domain (U.S. Gov) | bulk feed + FDSN on-demand history |
| NASA EONET v3 | Public domain (NASA) | wildfire/flood/cyclone/drought/landslide/volcano events |
| Open-Meteo (ERA5, CAMS, GeoNames) | CC-BY 4.0 | on-demand location indicators + search |
| OSM Nominatim | ODbL 1.0 | reverse geocoding, ≤1 req/s, cached 24 h |
| CARTO/OpenFreeMap basemaps | attribution required | frontend concern only |
| ReliefWeb v2 | attribution to original source | **needs approved appname** |
| NASA FIRMS | Public domain | **needs MAP_KEY**, adapter pending validation |

## Layout

```
backend-yii2/
├── api/modules/v1/            REST module (controllers + support)
├── common/models/             ActiveRecord models (snake_case rows)
├── common/services/           LocationSearchService, LocationDetailService
├── console/components/ingest/ SourceRegistry, IngestRunner, adapters
├── console/controllers/       IngestController (php yii ingest/…)
├── config/                    common/web/console configuration
├── migrations/                PostGIS schema + registry seed
└── web/index.php              entry point
```
