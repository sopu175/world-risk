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

**Auth (admin only)** — when `ADMIN_TOKEN` is set, admin endpoints require the
`x-admin-token` header; otherwise they run in open mode (visible warning in the
admin UI).

## Endpoints

| Method & path | Params / body | Returns |
| --- | --- | --- |
| `GET /api/layers` | — | `{ layers: LayerDTO[] }` — computed `status`: `live` \| `needs_config` \| `unavailable` \| `location_level` |
| `GET /api/observations` | `layer=all\|earthquake`, `bbox=west,south,east,north`, `limit≤5000`, `minMagnitude` | `{ observations: ObservationDTO[], meta { datasetVersion, generatedAt, truncated } }` |
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
| `GET /api/admin/overview` | admin | `{ stats, sources[], runs[], coverage, corrections[], adminAuthMode }` |
| `PATCH /api/admin/sources` | `{ key, enabled?, notes? }` | Toggles a source; enabling resets the failure counter |
| `POST /api/admin/ingest` | `{ sources?: string[], trigger?: manual\|scheduled\|bootstrap }` | `{ outcomes: RunOutcome[] }` |
| `GET /api/admin/runs?limit=50` | admin | `{ runs: IngestionRunDTO[] }` — full audit trail |
| `PATCH /api/admin/corrections` | `{ id, status: open\|resolved\|rejected, adminNote? }` | Moderation queue update |

## DTO shape (essentials)

**LayerDTO** — `key, name, hazardType, kind, description, units, methodology, resolution, temporalCoverage, licenseName, licenseUrl, limitations, sourceKey, colorHex, mapAvailable, status, statusReason, legend[], recordCount, lastUpdatedAt`

**ObservationDTO** — `id, externalId, layerKey, lat, lng, magnitude, magnitudeType, depthKm, value, unit, severityLabel, place, countryCode, occurredAt, sourceUrl`

**EventDTO** — `id, externalId, title, eventType, kind, lat?, lng?, placeName?, countryName?, countryCode?, startDate?, endDate?, severityLabel?, severityValue?, severityUnit?, sourceName, sourceUrl?, sourcePublishedAt?, verificationStatus (source_reported|cross_verified|unverified), summary?`

**LocationDetailDTO** — `{ location { name, latitude, longitude, country?, countryCode?, admin1?, elevationM?, timezone?, population?, localTime? }, indicators: IndicatorDTO[3] (earthquake_history | extreme_heat | air_quality), nearbyEvents { radiusKm, events[] }, disclaimers[3], generatedAt }`

**IndicatorDTO** — `key, name, available, unavailableReason?, valueSummary?, source { name, provider, url, licenseName, licenseUrl, lastSuccessAt, datasetVersion }, methodology?, limitations?, data` — each indicator **fails independently**: one degraded upstream never blanks the panel.

**Indicator data payloads**

- `earthquake_history` → `{ count10y, maxMag10y?, perYear: [{year,count,maxMag}], events: [{id,date,mag,depthKm?,place?,url?}] }` (USGS FDSN, M≥4.5, ≤300 km, 10 y)
- `extreme_heat` → `{ thresholdC, baselineHotDaysPerYear, recentHotDaysPerYear?, trendDeltaPct?, coverageStart, coverageEnd, annualSeries: [{year,hotDays,maxTmaxC?}], climatology: [{month,meanTmaxC}] }` (ERA5 1995–present)
- `air_quality` → `{ pm25Current?, pm25Last24hMean?, category?: {label,color}, hourly: [{time,pm25?}], hoursCovered }` (CAMS, 72 h)

## Client contract

The frontend validates **every** response with Zod (`src/lib/validation.ts`,
`src/lib/api-client.ts`) before rendering. Server-side ingestion validates every
upstream payload the same way — invalid records are counted in the run audit,
never silently dropped or patched over.
