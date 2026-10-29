// Zod schemas (zod v4) used in three places:
//  1. Ingestion — validating external payloads before anything touches the DB.
//  2. API routes — validating query params and request bodies.
//  3. Frontend — parsing every API response before it reaches the UI.

import { z } from "zod";
import { HAZARD_TYPES } from "@/lib/types";

// ---------------------------------------------------------------------------
// External upstream payloads
// ---------------------------------------------------------------------------

/** USGS earthquake feed / FDSN GeoJSON */
export const usgsFeatureSchema = z.object({
  id: z.string().min(1),
  properties: z.object({
    mag: z.number().nullable(),
    place: z.string().nullable(),
    time: z.number().nullable(), // epoch ms
    updated: z.number().nullable(),
    url: z.string().url().nullable(),
    magType: z.string().nullable(),
    status: z.string().nullable(),
    tsunami: z.number().nullable(),
    sig: z.number().nullable(),
  }),
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number(), z.number()]), // [lng, lat, depthKm]
  }),
});

export const usgsFeedSchema = z.object({
  metadata: z.object({
    generated: z.number(),
    title: z.string(),
    // FDSN query responses omit `count`; the summary feeds include it.
    count: z.number().optional(),
  }),
  features: z.array(usgsFeatureSchema),
});

/** NASA EONET v3 */
export const eonetCategorySchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
});

export const eonetGeometrySchema = z.object({
  magnitudeValue: z.number().nullable().optional(),
  magnitudeUnit: z.string().nullable().optional(),
  date: z.string().min(4),
  type: z.string().optional(),
  // Point | LineString | Polygon | MultiPolygon — deep-first numeric-pair
  // extraction happens in the adapter, so only "is an array" is enforced here.
  coordinates: z.array(z.unknown()),
});

export const eonetEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  link: z.string().url().nullable().optional(),
  closed: z.string().nullable().optional(),
  categories: z.array(eonetCategorySchema).min(1),
  sources: z
    .array(z.object({ id: z.string(), url: z.string().url().nullable().optional() }))
    .default([]),
  geometry: z.array(eonetGeometrySchema).min(1),
});

export const eonetResponseSchema = z.object({
  title: z.string().optional(),
  events: z.array(eonetEventSchema),
});

/** Open-Meteo geocoding */
export const openMeteoGeocodeSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string().min(1),
        latitude: z.number(),
        longitude: z.number(),
        elevation: z.number().nullable().optional(),
        country: z.string().nullable().optional(),
        country_code: z.string().nullable().optional(),
        admin1: z.string().nullable().optional(),
        admin2: z.string().nullable().optional(),
        population: z.number().nullable().optional(),
        timezone: z.string().nullable().optional(),
        feature_code: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

/** Open-Meteo ERA5 archive (daily Tmax) */
export const openMeteoArchiveSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number().nullable()),
  }),
});

/** Open-Meteo air quality (hourly PM2.5) */
export const openMeteoAirQualitySchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    pm2_5: z.array(z.number().nullable()),
  }),
});

/** Open-Meteo Weather Forecast API — multi-point wind grid (one element per requested coordinate). */
export const openMeteoWindGridPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().nullable().optional(),
  hourly: z
    .object({
      time: z.array(z.string()),
      wind_speed_10m: z.array(z.number().nullable()),
      wind_gusts_10m: z.array(z.number().nullable()),
      wind_direction_10m: z.array(z.number().nullable()),
    })
    .optional(),
});

export const openMeteoWindGridSchema = z.union([
  z.array(openMeteoWindGridPointSchema),
  openMeteoWindGridPointSchema,
]);

/** ReliefWeb v2 disasters (enabled only with an approved appname).
 *  Shape is deliberately permissive — the source cannot be schema-verified
 *  without credentials, so unknown fields are tolerated and required fields
 *  are minimal. A failed validation aborts the run and is logged, never
 *  silently ignored. */
export const reliefwebResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        fields: z.object({
          name: z.string().min(1),
          status: z.string().optional(),
          description: z.string().nullable().optional(),
          url: z.string().optional(),
          url_alias: z.string().optional(),
          date: z
            .object({
              event: z.string().optional(),
              created: z.string().optional(),
              revised: z.string().optional(),
            })
            .optional(),
          disaster_type: z.object({ name: z.string().optional() }).nullable().optional(),
          country: z
            .array(
              z.object({
                name: z.string(),
                shortname: z.string().nullable().optional(),
                iso3: z.string().nullable().optional(),
                location: z
                  .object({ lat: z.number().nullable().optional(), lon: z.number().nullable().optional() })
                  .nullable()
                  .optional(),
              }),
            )
            .optional(),
        }),
      }),
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// API request validation
// ---------------------------------------------------------------------------

const hazardTypeOrAll = z
  .string()
  .refine((v) => v === "all" || (HAZARD_TYPES as readonly string[]).includes(v), "unknown hazard type");

export const observationsQuerySchema = z.object({
  layer: hazardTypeOrAll.default("all"),
  bbox: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(3000),
  minMagnitude: z.coerce.number().min(0).max(10).optional(),
});

export const eventsQuerySchema = z.object({
  type: hazardTypeOrAll.default("all"),
  kind: z.enum(["all", "historical", "active", "model", "projection"]).default("all"),
  bbox: z.string().optional(),
  days: z.coerce.number().int().min(1).max(3650).default(365),
  limit: z.coerce.number().int().min(1).max(1000).default(400),
});

export const locationSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  count: z.coerce.number().int().min(1).max(10).default(6),
});

export const locationDetailBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().length(2).optional(),
});

export const correctionBodySchema = z.object({
  targetType: z.enum(["event", "observation", "location"]),
  targetId: z.string().max(64).optional(),
  targetLabel: z.string().max(160).optional(),
  field: z.string().max(60).optional(),
  proposedValue: z.string().max(500).optional(),
  message: z.string().trim().min(10).max(2000),
  submitterEmail: z.union([z.string().email().max(160), z.literal("")]).optional(),
});

/** Body for the scheduled ingest trigger endpoint (POST /api/ingest/run). */
export const ingestRunBodySchema = z.object({
  sources: z.array(z.string()).max(20).optional(),
  trigger: z.enum(["manual", "scheduled", "bootstrap"]).default("manual"),
});

export const savedLocationBodySchema = z.object({
  sessionId: z.string().min(8).max(64),
  label: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  countryName: z.string().max(80).optional(),
  note: z.string().max(300).optional(),
});

// ---------------------------------------------------------------------------
// Shared DTO schemas for client-side response parsing
// ---------------------------------------------------------------------------

export const sourceRefSchema = z.object({
  name: z.string(),
  provider: z.string(),
  url: z.string(),
  licenseName: z.string(),
  licenseUrl: z.string(),
  lastSuccessAt: z.string().nullable(),
  datasetVersion: z.string().nullable(),
});

export const layerDTOSchema = z.object({
  key: z.string(),
  name: z.string(),
  hazardType: z.string(),
  kind: z.enum(["observation", "event", "model", "projection"]),
  description: z.string(),
  units: z.string().nullable(),
  methodology: z.string().nullable(),
  resolution: z.string().nullable(),
  temporalCoverage: z.string().nullable(),
  licenseName: z.string().nullable(),
  licenseUrl: z.string().nullable(),
  limitations: z.string().nullable(),
  sourceKey: z.string().nullable(),
  colorHex: z.string(),
  mapAvailable: z.boolean(),
  status: z.enum(["live", "needs_config", "unavailable", "location_level"]),
  statusReason: z.string().nullable(),
  legend: z
    .array(z.object({ label: z.string(), color: z.string(), min: z.number().optional(), max: z.number().optional() }))
    .nullable(),
  recordCount: z.number(),
  lastUpdatedAt: z.string().nullable(),
});

export const observationDTOSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  layerKey: z.string(),
  lat: z.number(),
  lng: z.number(),
  magnitude: z.number().nullable(),
  magnitudeType: z.string().nullable(),
  depthKm: z.number().nullable(),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  severityLabel: z.string().nullable(),
  place: z.string().nullable(),
  countryCode: z.string().nullable(),
  occurredAt: z.string(),
  sourceUrl: z.string().nullable(),
});

export const eventDTOSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  title: z.string(),
  eventType: z.string(),
  kind: z.enum(["historical", "active", "model", "projection"]),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  placeName: z.string().nullable(),
  countryName: z.string().nullable(),
  countryCode: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  severityLabel: z.string().nullable(),
  severityValue: z.number().nullable(),
  severityUnit: z.string().nullable(),
  sourceName: z.string(),
  sourceUrl: z.string().nullable(),
  sourcePublishedAt: z.string().nullable(),
  verificationStatus: z.enum(["source_reported", "cross_verified", "unverified"]),
  summary: z.string().nullable(),
});

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export function apiOk<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ data: dataSchema });
}
