// Event-type → color fallback map (matches the hazard metadata registry).

export const LAYER_COLOR_BY_EVENT_TYPE_FALLBACK: Record<string, string> = {
  earthquake: "#d97706",
  flood: "#0d9488",
  cyclone: "#9333ea",
  drought: "#ca8a04",
  wildfire: "#ea580c",
  landslide: "#854d0e",
  volcano: "#b91c1c",
  extreme_heat: "#dc2626",
  air_quality: "#4d7c0f",
  other: "#57534e",
};
