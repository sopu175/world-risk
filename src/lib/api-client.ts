"use client";

// Frontend API client — every response is parsed with Zod before it reaches
// the UI. Failures surface as ApiError with a readable message.

import { z } from "zod";
import {
  layerDTOSchema,
  observationDTOSchema,
  eventDTOSchema,
  eventsQuerySchema,
  apiErrorSchema,
} from "@/lib/validation";
import type {
  EventsSummaryDTO,
  GeoSearchResult,
  LayerDTO,
  LocationDetailDTO,
  ObservationDTO,
  EventDTO,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const envelope = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ data: inner });

async function api<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Network request failed — check your connection.", "network_error", 0);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Invalid response from ${path} (HTTP ${res.status})`, "bad_json", res.status);
  }

  if (!res.ok) {
    const err = apiErrorSchema.safeParse(json);
    throw new ApiError(
      err.success ? err.data.error.message : `Request failed (HTTP ${res.status})`,
      err.success ? err.data.error.code : "http_error",
      res.status,
    );
  }

  const parsed = envelope(schema).safeParse(json);
  if (!parsed.success) {
    throw new ApiError(`Response contract mismatch for ${path}`, "contract_error", res.status);
  }
  return parsed.data.data as T;
}

// ---------------------------------------------------------------------------
// DTO schemas reused across endpoints
// ---------------------------------------------------------------------------

const sourceRefSchema = z.object({
  name: z.string(),
  provider: z.string(),
  url: z.string(),
  licenseName: z.string(),
  licenseUrl: z.string(),
  lastSuccessAt: z.string().nullable(),
  datasetVersion: z.string().nullable(),
});

const indicatorSchema = z.object({
  key: z.string(),
  name: z.string(),
  available: z.boolean(),
  unavailableReason: z.string().nullable(),
  valueSummary: z.string().nullable(),
  source: sourceRefSchema,
  methodology: z.string().nullable(),
  limitations: z.string().nullable(),
  data: z.unknown(),
});

export const locationDetailSchema = z.object({
  location: z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    country: z.string().nullable(),
    countryCode: z.string().nullable(),
    admin1: z.string().nullable(),
    elevationM: z.number().nullable(),
    timezone: z.string().nullable(),
    population: z.number().nullable(),
    localTime: z.string().nullable(),
  }),
  indicators: z.array(indicatorSchema),
  nearbyEvents: z.object({ radiusKm: z.number(), events: z.array(eventDTOSchema) }),
  disclaimers: z.array(z.string()),
  generatedAt: z.string(),
});

export const compareRowSchema = z.object({
  name: z.string(),
  country: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  isCurrent: z.boolean(),
  hotDaysBaseline: z.number().nullable(),
  hotDaysRecent: z.number().nullable(),
  trendDeltaPct: z.number().nullable(),
  quakes10y: z.number().nullable(),
  maxMag10y: z.number().nullable(),
});

export const eventsSummarySchema = z.object({
  total: z.number(),
  activeCount: z.number(),
  byType: z.array(z.object({ eventType: z.string(), count: z.number(), activeCount: z.number(), lastAt: z.string().nullable() })),
  coverageStart: z.string().nullable(),
  coverageEnd: z.string().nullable(),
});

export const searchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  admin1: z.string().nullable(),
  country: z.string().nullable(),
  countryCode: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().nullable(),
  population: z.number().nullable(),
  timezone: z.string().nullable(),
  featureCode: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Endpoint functions
// ---------------------------------------------------------------------------

export async function fetchLayers(): Promise<LayerDTO[]> {
  const d = await api("/api/layers", z.object({ layers: z.array(layerDTOSchema) }));
  return d.layers;
}

export async function fetchObservations(limit = 4000): Promise<ObservationDTO[]> {
  const d = await api(
    `/api/observations?layer=all&limit=${limit}`,
    z.object({ observations: z.array(observationDTOSchema), meta: z.object({ datasetVersion: z.string().nullable(), generatedAt: z.string().nullable(), truncated: z.boolean() }).passthrough() }),
  );
  return d.observations;
}

export async function fetchEvents(params: { type?: string; kind?: string; days?: number; limit?: number } = {}): Promise<EventDTO[]> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.kind) qs.set("kind", params.kind);
  qs.set("days", String(params.days ?? 365));
  qs.set("limit", String(params.limit ?? 500));
  eventsQuerySchema.parse({ type: params.type ?? "all", kind: params.kind ?? "all", days: params.days ?? 365, limit: params.limit ?? 500 });
  const d = await api(
    `/api/events?${qs.toString()}`,
    z.object({ events: z.array(eventDTOSchema), meta: z.object({ count: z.number(), truncated: z.boolean(), windowDays: z.number() }) }),
  );
  return d.events;
}

export async function fetchEventsSummary(): Promise<EventsSummaryDTO> {
  return api("/api/events/summary", eventsSummarySchema);
}

export async function searchLocations(q: string): Promise<GeoSearchResult[]> {
  const d = await api(
    `/api/locations/search?q=${encodeURIComponent(q)}`,
    z.object({ results: z.array(searchResultSchema), attribution: z.string() }),
  );
  return d.results;
}

export async function fetchLocationDetail(body: {
  latitude: number;
  longitude: number;
  name?: string;
  country?: string;
  countryCode?: string;
}): Promise<LocationDetailDTO> {
  return api("/api/locations/detail", locationDetailSchema, { method: "POST", body: JSON.stringify(body) });
}

export async function fetchLocationCompare(body: {
  latitude: number;
  longitude: number;
}): Promise<z.infer<typeof compareRowSchema>[]> {
  const d = await api("/api/locations/compare", z.object({ rows: z.array(compareRowSchema) }), {
    method: "POST",
    body: JSON.stringify(body),
  });
  return d.rows;
}

export async function submitCorrection(body: {
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  field?: string;
  proposedValue?: string;
  message: string;
  submitterEmail?: string;
}): Promise<{ id: string; status: string }> {
  return api(
    "/api/corrections",
    z.object({ id: z.string(), status: z.string(), createdAt: z.string(), message: z.string() }),
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function runBootstrap(): Promise<void> {
  await api("/api/ingest/bootstrap", z.object({ bootstrapped: z.boolean() }), { method: "POST" });
}
