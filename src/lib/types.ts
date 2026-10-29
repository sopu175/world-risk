// Shared DTO contracts between the REST API and the frontend.
// The same contracts are implemented by the production Yii2 backend
// (see backend-yii2/) and documented in docs/API.md.

export type SourceRef = {
  name: string;
  provider: string;
  url: string;
  licenseName: string;
  licenseUrl: string;
  lastSuccessAt: string | null;
  datasetVersion: string | null;
};

export type LegendBin = { label: string; color: string; min?: number; max?: number };

export type LayerStatus = "live" | "needs_config" | "unavailable" | "location_level";

export type LayerDTO = {
  key: string;
  name: string;
  hazardType: string;
  kind: "observation" | "event" | "model" | "projection";
  description: string;
  units: string | null;
  methodology: string | null;
  resolution: string | null;
  temporalCoverage: string | null;
  licenseName: string | null;
  licenseUrl: string | null;
  limitations: string | null;
  sourceKey: string | null;
  colorHex: string;
  mapAvailable: boolean;
  status: LayerStatus;
  statusReason: string | null;
  legend: LegendBin[] | null;
  recordCount: number;
  lastUpdatedAt: string | null;
};

export type ObservationDTO = {
  id: string;
  externalId: string;
  layerKey: string;
  lat: number;
  lng: number;
  magnitude: number | null;
  magnitudeType: string | null;
  depthKm: number | null;
  value: number | null;
  unit: string | null;
  severityLabel: string | null;
  place: string | null;
  countryCode: string | null;
  occurredAt: string;
  sourceUrl: string | null;
};

export type EventDTO = {
  id: string;
  externalId: string;
  title: string;
  eventType: string;
  kind: "historical" | "active" | "model" | "projection";
  lat: number | null;
  lng: number | null;
  placeName: string | null;
  countryName: string | null;
  countryCode: string | null;
  startDate: string | null;
  endDate: string | null;
  severityLabel: string | null;
  severityValue: number | null;
  severityUnit: string | null;
  sourceName: string;
  sourceUrl: string | null;
  sourcePublishedAt: string | null;
  verificationStatus: "source_reported" | "cross_verified" | "unverified";
  summary: string | null;
};

export type EventsSummaryDTO = {
  total: number;
  activeCount: number;
  byType: { eventType: string; count: number; activeCount: number; lastAt: string | null }[];
  coverageStart: string | null;
  coverageEnd: string | null;
};

export type GeoSearchResult = {
  id: string;
  name: string;
  admin1: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null;
  population: number | null;
  timezone: string | null;
  featureCode: string | null;
};

export type IndicatorDTO = {
  key: string;
  name: string;
  available: boolean;
  unavailableReason: string | null;
  valueSummary: string | null;
  source: SourceRef;
  methodology: string | null;
  limitations: string | null;
  data: unknown; // indicator-specific payload, validated client-side
};

export type NearbyEventGroup = {
  radiusKm: number;
  events: EventDTO[];
};

export type LocationDetailDTO = {
  location: {
    name: string;
    latitude: number;
    longitude: number;
    country: string | null;
    countryCode: string | null;
    admin1: string | null;
    elevationM: number | null;
    timezone: string | null;
    population: number | null;
    localTime: string | null;
  };
  indicators: IndicatorDTO[];
  nearbyEvents: NearbyEventGroup;
  disclaimers: string[];
  generatedAt: string;
};

export type IngestionRunDTO = {
  id: string;
  sourceKey: string;
  sourceName: string;
  status: string;
  trigger: string;
  attempt: number;
  recordsFetched: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsInvalid: number;
  datasetVersion: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
};

export type CorrectionDTO = {
  id: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  field: string | null;
  proposedValue: string | null;
  message: string;
  submitterEmail: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export const HAZARD_TYPES = [
  "earthquake",
  "flood",
  "extreme_heat",
  "cyclone",
  "drought",
  "wildfire",
  "landslide",
  "air_quality",
  "volcano",
  "waves",
  "wind",
] as const;

export type RunStatus = "success" | "partial" | "failed";

export type HazardType = (typeof HAZARD_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<string, string> = {
  earthquake: "Earthquake",
  flood: "Flood",
  extreme_heat: "Extreme heat",
  cyclone: "Tropical cyclone / severe storm",
  drought: "Drought",
  wildfire: "Wildfire",
  landslide: "Landslide",
  air_quality: "Air quality",
  volcano: "Volcano",
  other: "Other",
};
