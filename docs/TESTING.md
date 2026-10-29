# Testing & verification strategy

Per the delivery constraints for this engagement, **no automated test code was
committed**. This document records what *was* verified, and the test plan to
add when the constraint is lifted.

## What was verified live (sandbox, real network)

| Area | Verification |
| --- | --- |
| Ingestion (USGS) | `POST /api/admin/ingest` → 1,936–1,942 features fetched, schema-validated, inserted; re-run proved dedup: `fetched=1937 inserted=2 updated=1 skipped=1934` |
| Ingestion (EONET) | 500 events (Polygon + Point geometries), cyclone severity labels, `cross_verified` flags; stale-module and coordinate-nesting bugs found & fixed during verification |
| Audit trail | `GET /api/admin/runs` shows every attempt incl. the historical `failed`/`partial` runs with error messages |
| Layer availability | `/api/layers` returns `live` (earthquake/wildfire/flood/cyclone), `unavailable` (drought/landslide — genuinely no current events), `location_level` (heat/air) |
| Location detail (Tokyo, Mombasa, Nairobi) | reverse geocode (Nominatim), elevation/timezone, quake history (real M7.5 Noto 2024 event present), ERA5 heat profile (+168% Tokyo trend), CAMS PM2.5; per-indicator failure isolation verified |
| Comparison | `/api/locations/compare` returns the 6 reference cities with same-methodology values |
| Frontend golden paths | Browser-verified (agent-browser): map render + basemap tiles, 1,926 earthquake circles + active-cyclone halos, layer toggles/legends/popovers, search → location panel → charts/compare/sources, events list → Cyclone Arnab detail with source citation, admin (sources/runs/coverage), methodology, dark mode, 390 px mobile layout, zero hydration errors on fresh load |
| Resilience | Flaky sandbox egress (~1/3 dropped fresh connections) mitigated with jittered retries; all endpoints eventually 200 |

## Known limitations (reported honestly)

1. **No PHP/PostgreSQL runtime in the sandbox** → `backend-yii2/` and
   `docs/schema-postgis.sql` are delivered unexecuted (see backend README).
2. ReliefWeb + FIRMS sources ship disabled (`needs_config`) until credentials exist.
3. Drought/landslide layers show `unavailable` when EONET has no current-window
   events — honest state, not a bug.
4. In-process TTL caches are per-instance; multi-node production should swap
   `TtlCache` for Redis (call sites unchanged).

## Test plan to add (when permitted)

**Unit** (vitest + bun test):
- `validation.ts` schemas against recorded upstream fixtures (USGS feed sample,
  EONET Polygon/Point/MultiPolygon mix, Open-Meteo variants)
- `geo.ts` (bbox parsing incl. antimeridian, haversine)
- heat indicator math on synthetic ERA5 series (threshold auto-scaling, trend)
- ingest runner status matrix (success/partial/failed/auto-disable)

**Integration** (test DB):
- adapters against recorded fixtures → assert insert/update/skip counts
- corrections queue lifecycle; saved-locations session scoping

**E2E** (Playwright):
- golden paths exercised manually during this build (see table above)

**Load/regression**:
- bbox query latency at 10k observations; ingestion under concurrent triggers

**Yii2 backend** (production): Codeception acceptance suite driving the
contract table in `backend-yii2/README.md`; PHPUnit adapter tests against the
same fixtures.
