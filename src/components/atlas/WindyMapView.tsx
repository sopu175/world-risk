"use client";

import { useState, useEffect } from "react";
import { Waves, Wind, CloudRain, Thermometer, Cloud, Activity, ExternalLink, RefreshCw, Compass, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAtlas, type WindyOverlay } from "@/lib/store";
import { cn } from "@/lib/utils";

interface RegionPreset {
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  flag: string;
}

const REGION_PRESETS: RegionPreset[] = [
  { name: "Bangladesh & Bay of Bengal", lat: 23.702, lon: 90.374, zoom: 5, flag: "🇧🇩" },
  { name: "Indian Ocean", lat: -4.0, lon: 77.0, zoom: 4, flag: "🌊" },
  { name: "East Asia & Pacific", lat: 26.0, lon: 130.0, zoom: 4, flag: "🌏" },
  { name: "Atlantic & Europe", lat: 42.0, lon: -20.0, zoom: 4, flag: "🌍" },
  { name: "Americas & Caribbean", lat: 20.0, lon: -75.0, zoom: 5, flag: "🌎" },
];

const OVERLAYS: { id: WindyOverlay; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "waves", label: "Waves & Swell", icon: <Waves className="h-3.5 w-3.5 text-teal-400" />, desc: "Significant wave height, swell waves, ocean periods (ECMWF WAM)" },
  { id: "wind", label: "Wind Streams", icon: <Wind className="h-3.5 w-3.5 text-emerald-400" />, desc: "Surface 10m wind stream vectors & velocity (ECMWF IFS / GFS)" },
  { id: "gust", label: "Wind Gusts", icon: <Compass className="h-3.5 w-3.5 text-amber-400" />, desc: "Peak wind gusts & localized atmospheric turbulence" },
  { id: "rain", label: "Rain & Thunder", icon: <CloudRain className="h-3.5 w-3.5 text-blue-400" />, desc: "Precipitation accumulation, weather radar & thunderstorms" },
  { id: "temp", label: "Temperature", icon: <Thermometer className="h-3.5 w-3.5 text-rose-400" />, desc: "Surface 2m atmospheric air temperature (°C)" },
  { id: "clouds", label: "Clouds", icon: <Cloud className="h-3.5 w-3.5 text-slate-300" />, desc: "Cloud cover fraction and satellite infrared imagery" },
  { id: "cams", label: "Air Quality (PM2.5)", icon: <Activity className="h-3.5 w-3.5 text-purple-400" />, desc: "Copernicus CAMS particulate matter (PM2.5) concentrations" },
];

export function WindyMapView() {
  const { windyOverlay, setWindyOverlay, selectedLocation } = useAtlas();

  // Default coordinate is Dhaka, Bangladesh (user requested link: https://www.windy.com/-Waves-waves?waves,23.702,90.374,5)
  const [manualCoords, setManualCoords] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Derive coordinates: manual override takes priority, then selected location from atlas, then default (Dhaka)
  const coords = manualCoords ?? (selectedLocation
    ? {
        lat: Number(selectedLocation.latitude.toFixed(3)),
        lon: Number(selectedLocation.longitude.toFixed(3)),
        zoom: 6,
      }
    : {
        lat: 23.702,
        lon: 90.374,
        zoom: 5,
      });

  function updateCoords(newCoords: { lat: number; lon: number; zoom: number }) {
    setManualCoords(newCoords);
  }

  const currentOverlayMeta = OVERLAYS.find((o) => o.id === windyOverlay) ?? OVERLAYS[0];
  const externalWindyUrl = `https://www.windy.com/-Waves-${windyOverlay}?${windyOverlay},${coords.lat},${coords.lon},${coords.zoom}`;
  const embedUrl = `https://embed.windy.com/embed2.html?lat=${coords.lat}&lon=${coords.lon}&detailLat=${coords.lat}&detailLon=${coords.lon}&width=100%25&height=100%25&zoom=${coords.zoom}&level=surface&overlay=${windyOverlay}&product=ecmwf&menu=&message=true&marker=&calendar=now&pressure=true&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ------------------------------------------------ Top Control Toolbar */}
      <div className="flex flex-col gap-2 border-b bg-card px-3 py-2.5 sm:px-4">
        {/* Row 1: Overlays */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Windy map layers">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Layer:
            </span>
            {OVERLAYS.map((ov) => {
              const active = windyOverlay === ov.id;
              return (
                <button
                  key={ov.id}
                  onClick={() => setWindyOverlay(ov.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  role="tab"
                  aria-selected={active}
                >
                  {ov.icon}
                  <span>{ov.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <a
              href={externalWindyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
              title="Open full interactive view on Windy.com"
            >
              <span>Windy.com</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setRefreshKey((k) => k + 1)}
              title="Reload live stream"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Row 2: Region Quick-Presets & Information */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Quick Jump:</span>
            {REGION_PRESETS.map((p) => {
              const isMatch = coords.lat === p.lat && coords.lon === p.lon;
              return (
                <button
                  key={p.name}
                  onClick={() => updateCoords({ lat: p.lat, lon: p.lon, zoom: p.zoom })}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors",
                    isMatch
                      ? "bg-accent font-semibold text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                >
                  <span>{p.flag}</span>
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden text-[11px] text-muted-foreground lg:flex lg:items-center lg:gap-1.5">
            <MapPin className="h-3 w-3 text-primary" />
            <span>
              Center: {coords.lat.toFixed(2)}°N, {coords.lon.toFixed(2)}°E (Zoom {coords.zoom})
            </span>
            <span className="text-border">|</span>
            <span className="italic">{currentOverlayMeta.desc}</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ Interactive Iframe Container */}
      <div className="relative flex-1 bg-black">
        <iframe
          key={`${refreshKey}-${windyOverlay}-${coords.lat}-${coords.lon}-${coords.zoom}`}
          title="Windy.com Live Animated Waves and Weather Forecast"
          src={embedUrl}
          className="h-full w-full border-0"
          loading="lazy"
          allow="fullscreen; geolocation"
        />

        {/* Floating helper legend badge */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-md border border-white/10 bg-black/75 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur-sm sm:flex sm:items-center sm:gap-2">
          <span className="flex h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
          <span>
            Live ECMWF animation: {currentOverlayMeta.label} · Timeline slider available at bottom of map
          </span>
        </div>
      </div>
    </div>
  );
}
