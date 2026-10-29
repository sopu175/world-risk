# REST API — WorldRisk Atlas

Base URL (sandbox MVP): `/api`. Production Yii2 backend: `/v1` (see
`backend-yii2/README.md`) — the contracts are identical.

**Envelopes**

```jsonc
// success
{ "data": { … } }
// failure (4xx/5xx)
{ "error": { "code": "validation_error", "message": "bbox must be…" } }
```

**Auth (scheduled ingest trigger only)** — when `ADMIN_TOKEN` is set,
`POST /api/ingest/run` requires the `x-admin-token` header; otherwise it runs
in open mode (self-hosted deployments). Every other endpoint is public.

## Endpoints

| Method & path | Params / body | Returns |
| --- | --- | --- |
| `GET /api/layers` | — | `{ layers: LayerDTO[] }` — computed `status`: `live` \| `needs_config` \| `unavailable` \| `location_level` |
| `GET /api/observations` | `layer=all\|earthquake\|waves\|wind`, `bbox=west,south,east,north`, `limit≤5000`, `minMagnitude` | `{ observations: ObservationDTO[], meta { datasetVersion, generatedAt, truncated } }` |
| `GET /api/events` | `type`, `kind=all\|historical\|active\|model\|projection`, `bbox`, `days≤3650`, `limit≤1000` | `{ events: EventDTO[], meta }` |
| `GET /api/events/summary` | — | `{ total, activeCount, byType[], coverageStart, coverageEnd }` |
| `GET /api/locations/search` | `q≥2 chars`, `count≤10` | `{ results: GeoSearchResult[], attribution }` — Open-Meteo/GeoNames |
| `POST /api/locations/detail` | `{ latitude, longitude, name?, country?, countryCode? }` | `LocationDetailDTO` (see below) |
| `POST /api/locations/compare` | `{ latitude, longitude }` | `{ rows: CompareRow[] }` — vs 6 reference cities, same methodology |
| `POST /api/corrections` | `{ targetType: event\|observation\|location, message (10–2000 chars), targetId?, targetLabel?, field?, proposedValue?, submitterEmail? }` | `201 { id, status: "open", … }` |
| `GET /api/saved-locations?sessionId=` | — | `{ savedLocations: [...] }` |
| `POST /api/saved-locations` | `{ sessionId, label, latitude, longitude, countryName?, note? }` | `201 { savedLocation }` |
| `DELETE /api/saved-locations?id=&sessionId=` | — | `{ deleted }` |
| `POST /api/ingest/bootstrap` | — | Idempotent first-run import (`{ bootstrapped: true }`) |
| `POST /api/ingest/run` | `{ sources?: string[], trigger?: manual\|scheduled\|bootstrap }` | `{ outcomes: RunOutcome[] }` — trigger for workers/external cron (the in-app scheduler calls the runner directly) |
| `GET /api/ingest/runs?limit=50` | — | `{ runs: IngestionRunDTO[] }` — public, read-only ingestion audit trail |

## DTO shape (essentials)

**LayerDTO** — `key, name, hazardType, kind, description, units, methodology, resolution, temporalCoverage, licenseName, licenseUrl, limitations, sourceKey, colorHex, mapAvailable, status, statusReason, legend[], recordCount, lastUpdatedAt`

**ObservationDTO** — `id, externalId, layerKey, lat, lng, magnitude, magnitudeType, depthKm, value, unit, severityLabel, place, countryCode, occurredAt, sourceUrl`

**EventDTO** — `id, externalId, title, eventType, kind, lat?, lng?, placeName?, countryName?, countryCode?, startDate?, endDate?, severityLabel?, severityValue?, severityUnit?, sourceName, sourceUrl?, sourcePublishedAt?, verificationStatus (source_reported|cross_verified|unverified), summary?`

**LocationDetailDTO** — `{ location { name, latitude, longitude, country?, countryCode?, admin1?, elevationM?, timezone?, population?, localTime? }, indicators: IndicatorDTO[4] (earthquake_history | extreme_heat | air_quality | wind), nearbyEvents { radiusKm, events[] }, disclaimers[3], generatedAt }`

**IndicatorDTO** — `key, name, available, unavailableReason?, valueSummary?, source { name, provider, url, licenseName, licenseUrl, lastSuccessAt, datasetVersion }, methodology?, limitations?, data` — each indicator **fails independently**: one degraded upstream never blanks the panel.

**Indicator data payloads**

- `earthquake_history` → `{ count10y, maxMag10y?, perYear: [{year,count,maxMag}], events: [{id,date,mag,depthKm?,place?,url?}] }` (USGS FDSN, M≥4.5, ≤300 km, 10 y)
- `extreme_heat` → `{ thresholdC, baselineHotDaysPerYear, recentHotDaysPerYear?, trendDeltaPct?, coverageStart, coverageEnd, annualSeries: [{year,hotDays,maxTmaxC?}], climatology: [{month,meanTmaxC}] }` (ERA5 1995–present)
- `air_quality` → `{ pm25Current?, pm25Last24hMean?, category?: {label,color}, hourly: [{time,pm25?}], hoursCovered }` (CAMS, 72 h)
- `wind` → `{ current?: { speedKmh, gustKmh?, dirDeg?, dirCompass?, beaufortB, beaufortName }, next48hPeakGustKmh?, strongWindThresholdKmh, baselineAnnualMaxWindKmh, recentAnnualMaxWindKmh?, baselineStrongWindDaysPerYear, recentStrongWindDaysPerYear?, coverageStart, coverageEnd, annualSeries: [{year, maxWindKmh?, maxGustKmh?, strongWindDays}] }` (Open-Meteo forecast + ERA5 1995–present)

## Client contract

The frontend validates **every** response with Zod (`src/lib/validation.ts`,
`src/lib/api-client.ts`) before rendering. Server-side ingestion validates every
upstream payload the same way — invalid records are counted in the run audit,
never silently dropped or patched over.
