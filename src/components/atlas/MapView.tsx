"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MlMap,
  MapMouseEvent,
  Popup as MlPopup,
} from "maplibre-gl";
import { escapeHtml, formatCoord, formatDateSafe } from "@/lib/geo";
import { EVENT_TYPE_LABELS, type EventDTO, type LayerDTO, type ObservationDTO } from "@/lib/types";
import type { FlyTarget, SelectedLocation } from "@/lib/store";

// ---------------------------------------------------------------------------

// Free, no-registration vector basemap (OpenFreeMap, neutral Positron style)
const POSITRON_BASEMAP = "https://tiles.openfreemap.org/styles/positron";

const EQ_COLOR: unknown = [
  "interpolate",
  ["linear"],
  ["get", "mag"],
  2.5,
  "#fbbf24",
  4,
  "#f59e0b",
  5,
  "#d97706",
  6,
  "#c2410c",
  7,
  "#991b1b",
];

const EVENT_COLOR: unknown = [
  "match",
  ["get", "eventType"],
  "earthquake",
  "#d97706",
  "flood",
  "#0d9488",
  "cyclone",
  "#9333ea",
  "drought",
  "#ca8a04",
  "wildfire",
  "#ea580c",
  "landslide",
  "#854d0e",
  "volcano",
  "#b91c1c",
  "#57534e",
];

const WAVE_COLOR: unknown = [
  "interpolate",
  ["linear"],
  ["get", "val"],
  0,
  "#5eead4",
  1,
  "#2dd4bf",
  2,
  "#14b8a6",
  3,
  "#0d9488",
  4.5,
  "#0f766e",
  6,
  "#115e59",
  9,
  "#134e4a",
];

// Wind speed (km/h) — Beaufort-ordered ramp: light green → red → violet.
const WIND_COLOR: unknown = [
  "interpolate",
  ["linear"],
  ["get", "val"],
  2,
  "#86b57f",
  12,
  "#65a30d",
  20,
  "#ca8a04",
  29,
  "#ea580c",
  39,
  "#dc2626",
  50,
  "#991b1b",
  62,
  "#7e22ce",
  75,
  "#6b21a8",
  89,
  "#581c87",
  103,
  "#3b0764",
];

const EVENT_LAYERS = ["flood", "cyclone", "drought", "wildfire", "landslide", "volcano"];

function eqToGeojson(obs: ObservationDTO[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: obs
      .filter((o) => o.layerKey === "earthquake")
      .map((o) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [o.lng, o.lat] },
        properties: {
          extId: o.externalId,
          mag: o.magnitude ?? 0,
          depthKm: o.depthKm,
          place: o.place ?? "Unknown location",
          occurredAt: o.occurredAt,
          magType: o.magnitudeType ?? "M",
          url: o.sourceUrl ?? "",
        },
      })),
  };
}

function wavesToGeojson(obs: ObservationDTO[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: obs
      .filter((o) => o.layerKey === "waves" && o.value !== null)
      .map((o) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [o.lng, o.lat] },
        properties: {
          extId: o.externalId,
          val: o.value ?? 0,
          severity: o.severityLabel ?? "",
          occurredAt: o.occurredAt,
        },
      })),
  };
}

function windToGeojson(obs: ObservationDTO[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: obs
      .filter((o) => o.layerKey === "wind" && o.value !== null)
      .map((o) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [o.lng, o.lat] },
        properties: {
          extId: o.externalId,
          val: o.value ?? 0,
          unit: o.unit ?? "km/h",
          severity: o.severityLabel ?? "",
          occurredAt: o.occurredAt,
        },
      })),
  };
}

function eventsToGeojson(events: EventDTO[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: events
      .filter((e) => e.lat !== null && e.lng !== null)
      .map((e, i) => ({
        type: "Feature" as const,
        id: i,
        geometry: { type: "Point" as const, coordinates: [e.lng as number, e.lat as number] },
        properties: {
          eventId: e.id,
          title: e.title,
          eventType: e.eventType,
          kind: e.kind,
          startDate: e.startDate ?? "",
          endDate: e.endDate ?? "",
          severity: e.severityLabel ?? (e.severityValue !== null ? `${e.severityValue} ${e.severityUnit ?? ""}`.trim() : ""),
          sourceName: e.sourceName,
          sourceUrl: e.sourceUrl ?? "",
          verification: e.verificationStatus,
        },
      })),
  };
}

export type MapViewProps = {
  layers: LayerDTO[];
  observations: ObservationDTO[];
  events: EventDTO[];
  activeLayers: string[];
  onSelectEvent: (e: EventDTO) => void;
  onRequestLocation: (loc: SelectedLocation) => void;
  flyTarget: FlyTarget | null;
  onFlyDone: () => void;
};

export function MapView({
  layers,
  observations,
  events,
  activeLayers,
  onSelectEvent,
  onRequestLocation,
  flyTarget,
  onFlyDone,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<MlPopup | null>(null);
  const [ready, setReady] = useState(false);
  const [booting, setBooting] = useState(true);

  const propsRef = useRef({ observations, events, activeLayers, onSelectEvent, onRequestLocation });
  propsRef.current = { observations, events, activeLayers, onSelectEvent, onRequestLocation };

  // ------------------------------------------------------------------ init
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: POSITRON_BASEMAP,
        center: [12, 22],
        zoom: 1.5,
        minZoom: 1,
        maxZoom: 12,
        attributionControl: false,
        // keeps the drawing buffer readable for screenshots and some drivers
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      mapRef.current = map;

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

      map.on("load", () => {
        if (cancelled) return;
        ensureDataLayers(map);
        setReady(true);
        setBooting(false);
      });

      map.on("styledata", () => {
        if (!map.isStyleLoaded()) return;
        ensureDataLayers(map);
        pushEq(map, propsRef.current.observations);
        pushWaves(map, propsRef.current.observations);
        pushWind(map, propsRef.current.observations);
        pushEvents(map, propsRef.current.events);
        applyVisibility(map, propsRef.current.activeLayers);
      });

      map.on("click", (e: MapMouseEvent) => {
        handleMapClick(map, e);
      });
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // ------------------------------------------------------------ data pushes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    pushEq(map, observations);
    pushWaves(map, observations);
    pushWind(map, observations);
  }, [observations, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    pushEvents(map, events);
  }, [events, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyVisibility(map, activeLayers);
  }, [activeLayers, ready]);

  // -------------------------------------------------------------- flyTo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flyTarget) return;
    map.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: flyTarget.zoom ?? 6, duration: 1500, essential: true });
    onFlyDone();
  }, [flyTarget, ready]);

  // ------------------------------------------------------------- helpers
  function ensureDataLayers(map: MlMap) {
    if (!map.getSource("eq-src")) {
      map.addSource("eq-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getSource("waves-src")) {
      map.addSource("waves-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getSource("wind-src")) {
      map.addSource("wind-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getSource("events-src")) {
      map.addSource("events-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getLayer("eq-circles")) {
      map.addLayer({
        id: "eq-circles",
        type: "circle",
        source: "eq-src",
        paint: {
          "circle-color": EQ_COLOR as never,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            ["interpolate", ["linear"], ["get", "mag"], 2.5, 2.5, 7, 10],
            5,
            ["interpolate", ["linear"], ["get", "mag"], 2.5, 3.5, 7, 20],
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
          "circle-opacity": 0.82,
        },
      });
    }
    if (!map.getLayer("wave-circles")) {
      map.addLayer({
        id: "wave-circles",
        type: "circle",
        source: "waves-src",
        paint: {
          "circle-color": WAVE_COLOR as never,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            ["interpolate", ["linear"], ["get", "val"], 0, 3, 9, 8],
            5,
            ["interpolate", ["linear"], ["get", "val"], 0, 5, 9, 16],
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.7)",
          "circle-opacity": 0.72,
        },
      });
    }
    if (!map.getLayer("wind-circles")) {
      map.addLayer({
        id: "wind-circles",
        type: "circle",
        source: "wind-src",
        paint: {
          "circle-color": WIND_COLOR as never,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            ["interpolate", ["linear"], ["get", "val"], 0, 2.5, 100, 6],
            5,
            ["interpolate", ["linear"], ["get", "val"], 0, 4.5, 100, 13],
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.7)",
          "circle-opacity": 0.74,
        },
      });
    }
    if (!map.getLayer("event-circles")) {
      map.addLayer({
        id: "event-circles",
        type: "circle",
        source: "events-src",
        paint: {
          "circle-color": EVENT_COLOR as never,
          "circle-radius": 5.5,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "rgba(255,255,255,0.9)",
          "circle-opacity": 0.88,
        },
      });
      map.addLayer({
        id: "event-halo",
        type: "circle",
        source: "events-src",
        filter: ["==", ["get", "kind"], "active"],
        paint: {
          "circle-color": EVENT_COLOR as never,
          "circle-radius": 13,
          "circle-opacity": 0.22,
          "circle-stroke-width": 0,
        },
      });
    }
    applyVisibility(map, propsRef.current.activeLayers);
  }

  function handleMapClick(map: MlMap, e: MapMouseEvent) {
    const evFeatures = map.queryRenderedFeatures(e.point, { layers: ["event-circles"] });
    if (evFeatures.length > 0) {
      const p = evFeatures[0].properties as Record<string, string>;
      const dto = propsRef.current.events.find((ev) => ev.id === p.eventId);
      if (dto) {
        showEventPopup(map, e.lngLat.lng, e.lngLat.lat, dto);
        return;
      }
    }
    const eqFeatures = map.queryRenderedFeatures(e.point, { layers: ["eq-circles"] });
    if (eqFeatures.length > 0) {
      const p = eqFeatures[0].properties as Record<string, string | number>;
      showEqPopup(map, e.lngLat.lng, e.lngLat.lat, p);
      return;
    }
    const waveFeatures = map.queryRenderedFeatures(e.point, { layers: ["wave-circles"] });
    if (waveFeatures.length > 0) {
      const p = waveFeatures[0].properties as Record<string, string | number>;
      showWavePopup(map, e.lngLat.lng, e.lngLat.lat, p);
      return;
    }
    const windFeatures = map.queryRenderedFeatures(e.point, { layers: ["wind-circles"] });
    if (windFeatures.length > 0) {
      const p = windFeatures[0].properties as Record<string, string | number>;
      showWindPopup(map, e.lngLat.lng, e.lngLat.lat, p);
      return;
    }
    // Empty map click → inspect this location.
    popupRef.current?.remove();
    propsRef.current.onRequestLocation({
      latitude: Number(e.lngLat.lat.toFixed(4)),
      longitude: Number(e.lngLat.lng.toFixed(4)),
    });
  }

  function showEqPopup(map: MlMap, lng: number, lat: number, p: Record<string, string | number>) {
    const maplibreglRef = mapLibreCtorRef.current;
    if (!maplibreglRef) return;
    popupRef.current?.remove();
    const mag = typeof p.mag === "number" ? p.mag.toFixed(1) : "—";
    const depth = typeof p.depthKm === "number" ? `${p.depthKm.toFixed(0)} km` : "—";
    const html = `
      <div class="wra-popup">
        <div class="wra-popup-kicker">Earthquake · USGS</div>
        <div class="wra-popup-title">M ${escapeHtml(String(mag))} — ${escapeHtml(String(p.place))}</div>
        <div class="wra-popup-meta">${escapeHtml(String(p.magType))} · depth ${escapeHtml(depth)} · ${escapeHtml(formatDateSafe(new Date(Number.isFinite(+p.occurredAt) ? +p.occurredAt : p.occurredAt as string)))}</div>
        <div class="wra-popup-meta">${escapeHtml(formatCoord(lat, lng, 2))}</div>
        ${p.url ? `<a class="wra-popup-link" href="${escapeHtml(String(p.url))}" target="_blank" rel="noopener noreferrer">Open USGS event page ↗</a>` : ""}
      </div>`;
    popupRef.current = new maplibreglRef.Popup({ maxWidth: "270px", closeButton: true })
      .setLngLat([lng, lat])
      .setHTML(html)
      .addTo(map);
  }

  function showWavePopup(map: MlMap, lng: number, lat: number, p: Record<string, string | number>) {
    const maplibreglRef = mapLibreCtorRef.current;
    if (!maplibreglRef) return;
    popupRef.current?.remove();
    const val = typeof p.val === "number" ? p.val : Number(p.val);
    const html = `
      <div class="wra-popup">
        <div class="wra-popup-kicker">Ocean waves · ECMWF WAM via Open-Meteo</div>
        <div class="wra-popup-title">Significant wave height ${escapeHtml(String(Number.isFinite(val) ? val.toFixed(1) : "—"))} m</div>
        ${p.severity ? `<div class="wra-popup-meta">Sea state: ${escapeHtml(String(p.severity))} (Douglas scale)</div>` : ""}
        <div class="wra-popup-meta">${escapeHtml(formatCoord(lat, lng, 1))} · updated ${escapeHtml(formatDateSafe(new Date(Number.isFinite(+p.occurredAt) ? +p.occurredAt : (p.occurredAt as string))))}</div>
        <div class="wra-popup-meta">Grid sample of a ~25 km model — not a buoy reading</div>
      </div>`;
    popupRef.current = new maplibreglRef.Popup({ maxWidth: "270px", closeButton: true })
      .setLngLat([lng, lat])
      .setHTML(html)
      .addTo(map);
  }

  function showWindPopup(map: MlMap, lng: number, lat: number, p: Record<string, string | number>) {
    const maplibreglRef = mapLibreCtorRef.current;
    if (!maplibreglRef) return;
    popupRef.current?.remove();
    const val = typeof p.val === "number" ? p.val : Number(p.val);
    const html = `
      <div class="wra-popup">
        <div class="wra-popup-kicker">Wind &amp; gusts · ECMWF/GFS via Open-Meteo</div>
        <div class="wra-popup-title">Wind ${escapeHtml(String(Number.isFinite(val) ? Math.round(val) : "—"))} km/h</div>
        ${p.severity ? `<div class="wra-popup-meta">${escapeHtml(String(p.severity))} (Beaufort scale)</div>` : ""}
        <div class="wra-popup-meta">${escapeHtml(formatCoord(lat, lng, 1))} · updated ${escapeHtml(formatDateSafe(new Date(Number.isFinite(+p.occurredAt) ? +p.occurredAt : (p.occurredAt as string))))}</div>
        <div class="wra-popup-meta">Grid sample of an ~11 km model — not a station reading</div>
      </div>`;
    popupRef.current = new maplibreglRef.Popup({ maxWidth: "270px", closeButton: true })
      .setLngLat([lng, lat])
      .setHTML(html)
      .addTo(map);
  }

  function showEventPopup(map: MlMap, lng: number, lat: number, dto: EventDTO) {
    const maplibreglRef = mapLibreCtorRef.current;
    if (!maplibreglRef) return;
    popupRef.current?.remove();
    const dates =
      dto.startDate && dto.endDate
        ? `${formatDateSafe(dto.startDate)} → ${formatDateSafe(dto.endDate)}`
        : dto.startDate
          ? `${formatDateSafe(dto.startDate)}${dto.kind === "active" ? " (ongoing)" : ""}`
          : "date unknown";
    const html = `
      <div class="wra-popup">
        <div class="wra-popup-kicker">${escapeHtml(EVENT_TYPE_LABELS[dto.eventType] ?? dto.eventType)} · ${escapeHtml(dto.sourceName)}${dto.kind === "active" ? " · <span class='wra-active-dot'>ACTIVE</span>" : ""}</div>
        <div class="wra-popup-title">${escapeHtml(dto.title)}</div>
        <div class="wra-popup-meta">${escapeHtml(dates)}</div>
        ${dto.severityLabel || dto.severityValue !== null ? `<div class="wra-popup-meta">Severity: ${escapeHtml(dto.severityLabel ?? `${dto.severityValue ?? "?"} ${dto.severityUnit ?? ""}`.trim())}</div>` : ""}
        ${dto.sourceUrl ? `<a class="wra-popup-link" href="${escapeHtml(dto.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}
        <button class="wra-popup-btn" data-open-event>Open details & sources</button>
      </div>`;
    const popup = new maplibreglRef.Popup({ maxWidth: "280px", closeButton: true })
      .setLngLat([lng, lat])
      .setHTML(html)
      .addTo(map);
    popup.getElement()?.querySelector("[data-open-event]")?.addEventListener("click", () => {
      propsRef.current.onSelectEvent(dto);
      popup.remove();
    });
    popupRef.current = popup;
  }

  // hold the dynamically imported constructor for popup creation
  const mapLibreCtorRef = useRef<typeof import("maplibre-gl") | null>(null);
  useEffect(() => {
    import("maplibre-gl").then((m) => {
      mapLibreCtorRef.current = m;
    });
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* MapLibre forces the container to position:relative — size it normally,
          never with absolute inset-0. */}
      <div ref={containerRef} className="h-full w-full" aria-label="Interactive global hazard map" role="application" />
      {booting && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm border">
          Loading map…
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function pushEq(map: MlMap, obs: ObservationDTO[]) {
  const src = map.getSource("eq-src") as GeoJSONSource | undefined;
  if (src) src.setData(eqToGeojson(obs));
}

function pushWaves(map: MlMap, obs: ObservationDTO[]) {
  const src = map.getSource("waves-src") as GeoJSONSource | undefined;
  if (src) src.setData(wavesToGeojson(obs));
}

function pushWind(map: MlMap, obs: ObservationDTO[]) {
  const src = map.getSource("wind-src") as GeoJSONSource | undefined;
  if (src) src.setData(windToGeojson(obs));
}

function pushEvents(map: MlMap, events: EventDTO[]) {
  const src = map.getSource("events-src") as GeoJSONSource | undefined;
  if (src) src.setData(eventsToGeojson(events));
}

function applyVisibility(map: MlMap, activeLayers: string[]) {
  const eqOn = activeLayers.includes("earthquake");
  if (map.getLayer("eq-circles")) {
    map.setLayoutProperty("eq-circles", "visibility", eqOn ? "visible" : "none");
  }
  const wavesOn = activeLayers.includes("waves");
  if (map.getLayer("wave-circles")) {
    map.setLayoutProperty("wave-circles", "visibility", wavesOn ? "visible" : "none");
  }
  const windOn = activeLayers.includes("wind");
  if (map.getLayer("wind-circles")) {
    map.setLayoutProperty("wind-circles", "visibility", windOn ? "visible" : "none");
  }
  const activeEventTypes = EVENT_LAYERS.filter((t) => activeLayers.includes(t));
  const eventsOn = activeEventTypes.length > 0;
  if (map.getLayer("event-circles")) {
    map.setLayoutProperty("event-circles", "visibility", eventsOn ? "visible" : "none");
    map.setFilter(
      "event-circles",
      eventsOn ? ["in", ["get", "eventType"], ["literal", activeEventTypes]] : ["==", ["get", "eventType"], "__none__"]
    );
  }
  if (map.getLayer("event-halo")) {
    map.setLayoutProperty("event-halo", "visibility", eventsOn ? "visible" : "none");
    map.setFilter(
      "event-halo",
      eventsOn
        ? ["all", ["==", ["get", "kind"], "active"], ["in", ["get", "eventType"], ["literal", activeEventTypes]]]
        : ["==", ["get", "eventType"], "__none__"]
    );
  }
}
