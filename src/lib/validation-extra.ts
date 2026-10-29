// Additional upstream schemas for on-demand location services.
// (Kept separate from validation.ts to keep the ingestion contract file small.)

import { z } from "zod";

export const openMeteoGeocodeResponseSchema = z.object({
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
  generationtime_ms: z.number().optional(),
});

export const nominatimReverseSchema = z.object({
  display_name: z.string().optional(),
  name: z.string().optional(),
  address: z
    .object({
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      municipality: z.string().optional(),
      county: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      country_code: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export const openMeteoForecastSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  elevation: z.number().nullable().optional(),
  timezone: z.string().nullable().optional(),
  current: z
    .object({
      time: z.string().optional(),
      temperature_2m: z.number().nullable().optional(),
    })
    .optional(),
});
