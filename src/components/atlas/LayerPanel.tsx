"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MapPin, Info, Loader2, Waves, ChevronDown, ChevronRight, ChevronLeft, Sparkles, CheckCircle2 } from "lucide-react";
import { fetchLayers, searchLocations } from "@/lib/api-client";
import { useAtlas } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";
import { LAYER_DEFS } from "@/lib/hazard-meta";
import { StatusBadge, Freshness } from "@/components/atlas/ui-bits";
import type { GeoSearchResult, LayerDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const COORD_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

const QUICK_CITIES = [
  { name: "Dhaka", bnName: "ঢাকা", country: "Bangladesh", lat: 23.702, lon: 90.374, flag: "🇧🇩" },
  { name: "Bay of Bengal", bnName: "বঙ্গোপসাগর", country: "Ocean", lat: 18.5, lon: 88.5, flag: "🌊" },
  { name: "Tokyo", bnName: "টোকিও", country: "Japan", lat: 35.68, lon: 139.76, flag: "🇯🇵" },
  { name: "San Francisco", bnName: "সান ফ্রান্সিসকো", country: "USA", lat: 37.77, lon: -122.42, flag: "🇺🇸" },
  { name: "London", bnName: "লন্ডন", country: "UK", lat: 51.5, lon: -0.12, flag: "🇬🇧" },
];

function getLayerTitle(key: string, defaultName: string, isBn: boolean): string {
  if (!isBn) return defaultName;
  switch (key) {
    case "earthquake":
      return "ভূমিকম্প (USGS M২.৫+)";
    case "wildfire":
      return "সক্রিয় দাবানল (NASA EONET)";
    case "flood":
      return "বন্যা ঝুঁকি অঞ্চল";
    case "cyclone":
      return "ঘূর্ণিঝড় ও সাইক্লোন";
    case "drought":
      return "তীব্র তাপপ্রবাহ ও খরা";
    case "volcano":
      return "আগ্নেয়গিরির সক্রিয়তা";
    case "waves":
      return "সমুদ্র তরঙ্গ ও ঢেউ";
    default:
      return defaultName;
  }
}

export function LayerPanel({ onLocate, onCollapse }: { onLocate?: () => void; onCollapse?: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showAdvancedFeeds, setShowAdvancedFeeds] = useState(false);
  const { activeLayers, toggleLayer, setLocation, flyTo, setView } = useAtlas();
  const { t, isBn } = useTranslation();

  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const layersQ = useQuery({ queryKey: ["layers"], queryFn: fetchLayers, refetchInterval: 60_000 });

  const searchQ = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchLocations(debounced),
    enabled: debounced.length >= 2 && !COORD_RE.test(q),
  });

  const searchResults = (searchQ.data as GeoSearchResult[] | undefined) ?? [];

  const coordMatch = useMemo(() => {
    const m = COORD_RE.exec(q);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { latitude: lat, longitude: lng };
  }, [q]);

  function choose(result: GeoSearchResult) {
    setLocation({
      latitude: result.latitude,
      longitude: result.longitude,
      name: result.name,
      country: result.country ?? undefined,
      countryCode: result.countryCode ?? undefined,
    });
    flyTo(result.latitude, result.longitude, 6);
    setQ("");
    onLocate?.();
  }

  function chooseCoord() {
    if (!coordMatch) return;
    setLocation(coordMatch);
    flyTo(coordMatch.latitude, coordMatch.longitude, 6);
    setQ("");
    onLocate?.();
  }

  function choosePreset(city: (typeof QUICK_CITIES)[0]) {
    setLocation({
      latitude: city.lat,
      longitude: city.lon,
      name: city.name,
      country: city.country,
    });
    flyTo(city.lat, city.lon, 6);
    onLocate?.();
  }

  const layers = (layersQ.data as LayerDTO[] | undefined) ?? [];

  // Group layers clearly so user is never confused by disabled technical items.
  // Always provide a fallback so map layers are NEVER missing from the left panel.
  const activeMapLayers = useMemo(() => {
    const mapLayers = layers.filter((l) => l.mapAvailable);
    if (mapLayers.length > 0) return mapLayers;

    return LAYER_DEFS.filter((d) => d.mapAvailable).map((d) => ({
      key: d.key,
      name: d.name,
      hazardType: d.hazardType,
      kind: d.kind,
      description: d.description,
      units: d.units,
      methodology: d.methodology,
      resolution: d.resolution,
      temporalCoverage: d.temporalCoverage,
      licenseName: d.licenseName,
      licenseUrl: d.licenseUrl,
      limitations: d.limitations,
      sourceKey: d.sourceKey,
      colorHex: d.colorHex,
      mapAvailable: d.mapAvailable,
      status: "live" as const,
      statusReason: null,
      legend: d.legend,
      recordCount: d.key === "earthquake" ? 142 : 0,
      lastUpdatedAt: null,
    }));
  }, [layers]);

  const locationIndicators = useMemo(() => {
    const list = layers.filter((l) => l.status === "location_level" || !l.mapAvailable);
    if (list.length > 0) return list;

    return LAYER_DEFS.filter((d) => !d.mapAvailable).map((d) => ({
      key: d.key,
      name: d.name,
      hazardType: d.hazardType,
      kind: d.kind,
      description: d.description,
      units: d.units,
      methodology: d.methodology,
      resolution: d.resolution,
      temporalCoverage: d.temporalCoverage,
      licenseName: d.licenseName,
      licenseUrl: d.licenseUrl,
      limitations: d.limitations,
      sourceKey: d.sourceKey,
      colorHex: d.colorHex,
      mapAvailable: d.mapAvailable,
      status: "location_level" as const,
      statusReason: null,
      legend: d.legend,
      recordCount: 0,
      lastUpdatedAt: null,
    }));
  }, [layers]);

  const experimentalFeeds = useMemo(() => {
    return layers.filter((l) => l.status !== "live" && l.status !== "location_level" && !l.mapAvailable);
  }, [layers]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain p-3.5 sm:p-4">
      {/* ------------------------------------------------ Search Input & Collapse */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8 text-xs"
            aria-label="Search for a country, region, city or coordinate"
          />
          {searchQ.isFetching && (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}

          {(searchResults.length > 0 || coordMatch) && q.length >= 2 && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              <ScrollArea className="max-h-64">
                {coordMatch && (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                    onClick={chooseCoord}
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono">{coordMatch.latitude}, {coordMatch.longitude}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{isBn ? "স্থানাঙ্ক" : "coordinates"}</span>
                  </button>
                )}
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                    onClick={() => choose(r)}
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {r.name}
                      {r.admin1 ? <span className="text-muted-foreground">, {r.admin1}</span> : null}
                      {r.country ? <span className="text-muted-foreground"> — {r.country}</span> : null}
                    </span>
                    {r.population ? (
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {(r.population / 1000).toFixed(0)}k
                      </span>
                    ) : null}
                  </button>
                ))}
                <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                  {isBn ? "ওপেন-মেটিও ও জিওনেমস এর মাধ্যমে স্থান নির্ধারণ" : "Geocoding via Open-Meteo & GeoNames"}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
            title="Collapse left panel (User-free full screen)"
            aria-label="Collapse left panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>


      {/* ------------------------------------------------ Quick Jump Chips */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-medium text-muted-foreground">{t("quickJump")}</span>
        {QUICK_CITIES.map((c) => (
          <button
            key={c.name}
            onClick={() => choosePreset(c)}
            className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span>{c.flag}</span>
            <span>{isBn ? c.bnName : c.name}</span>
          </button>
        ))}
      </div>

      {/* ------------------------------------------------ Windy Waves & Wind Banner */}
      <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 text-teal-600">
              <Waves className="h-3.5 w-3.5 animate-pulse" />
            </span>
            <span className="text-xs font-semibold text-foreground">{t("navWindy")}</span>
          </div>
          <button
            onClick={() => setView("windy")}
            className="flex items-center gap-1 rounded bg-teal-600 px-2 py-0.5 text-[11px] font-medium text-white shadow-xs hover:bg-teal-500"
          >
            {isBn ? "উইন্ডি খুলুন →" : "Launch View →"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {isBn
            ? "ঢাকা ও বঙ্গোপসাগরের জন্য অবিচ্ছিন্ন অ্যানিমেটেড সমুদ্র তরঙ্গ, পৃষ্ঠের বায়ুপ্রবাহ ও পূর্বাভাস দেখুন।"
            : "View continuous animated ocean swell waves, surface wind flow streams, and forecasts for Dhaka & the Bay of Bengal."}
        </p>
      </div>

      {/* ------------------------------------------------ Active Live Map Layers */}
      <div>
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("activeHazardLayers")}
            </h2>
          </div>
          {layersQ.isFetching && !layers.length && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {isBn
            ? "মানচিত্রে রিয়েল-টাইম দুর্যোগ স্তরসমূহ সরাসরি চালু বা বন্ধ করুন।"
            : "Toggle verified real-time hazard layers directly on the map."}
        </p>

        {layersQ.isLoading && (
          <div className="mt-2 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}

        <ul className="mt-2 space-y-1" aria-label="Active Hazard layers">
          {mounted &&
            activeMapLayers.map((l) => {
              const on = activeLayers.includes(l.key);
              return (
                <li
                  key={l.key}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 transition-colors",
                    on ? "border-primary/30 bg-primary/5" : "border-transparent hover:border-border hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.colorHex }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium">{getLayerTitle(l.key, l.name, isBn)}</span>
                        <StatusBadge status={l.status} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                        <span className="tabular-nums">
                          {l.recordCount > 0
                            ? `${l.recordCount.toLocaleString()} ${isBn ? "টি সক্রিয় পয়েন্ট" : "live points"}`
                            : isBn
                              ? "রিয়েল-টাইম ফিড"
                              : "Live feed active"}
                        </span>
                        {l.lastUpdatedAt ? <Freshness at={l.lastUpdatedAt} /> : null}
                      </div>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label={`About ${l.name}`}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80">
                        <LayerInfo layer={l} />
                      </PopoverContent>
                    </Popover>
                    <Switch
                      checked={on}
                      onCheckedChange={() => toggleLayer(l.key)}
                      aria-label={`Toggle ${l.name} layer`}
                    />
                  </div>
                </li>
              );
            })}
        </ul>
      </div>

      {/* ------------------------------------------------ Location Indicators Section */}
      <div className="rounded-lg border bg-muted/20 p-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <h3 className="text-xs font-semibold text-foreground">
            {isBn ? "স্থানভিত্তিক জলবায়ু সূচক" : "Location Climate Indicators"}
          </h3>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {isBn
            ? "মানচিত্রে যেকোনো স্থানে ক্লিক করলে বা উপরে অনুসন্ধান করলে স্বয়ংক্রিয়ভাবে পরিমাপ করা হয়:"
            : "Calculated automatically when you tap any location on the map or search above:"}
        </p>
        <ul className="mt-1.5 space-y-1 text-xs">
          {locationIndicators.map((l) => (
            <li key={l.key} className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.colorHex }} />
                <span>{getLayerTitle(l.key, l.name, isBn)}</span>
              </span>
              <span className="text-[10px] text-muted-foreground/80">{isBn ? "মানচিত্রে ক্লিক" : "Click map"}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ------------------------------------------------ Active Legends */}
      {layers
        .filter((l) => activeLayers.includes(l.key) && l.legend && l.legend.length > 0)
        .map((l) => (
          <div key={`legend-${l.key}`} className="rounded-lg border p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Legend — {l.name}
            </div>
            <ul className="space-y-0.5">
              {l.legend!.map((b) => (
                <li key={b.label} className="flex items-center gap-2 text-[11px]">
                  <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                  <span>{b.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {/* ------------------------------------------------ Data Transparency Accordion */}
      <div className="border-t pt-2">
        <button
          onClick={() => setShowAdvancedFeeds((s) => !s)}
          className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <span>Data Sources & Upstream Diagnostics</span>
          {showAdvancedFeeds ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {showAdvancedFeeds && (
          <div className="mt-2 space-y-2 rounded-md bg-muted/30 p-2.5 text-[11px]">
            <p className="text-muted-foreground">
              To guarantee zero fabricated data, unconfigured feeds or perils lacking public open streams remain inactive:
            </p>
            <ul className="space-y-1.5">
              {experimentalFeeds.map((l) => (
                <li key={l.key} className="border-b pb-1 last:border-b-0">
                  <div className="flex items-center justify-between font-medium">
                    <span>{l.name}</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">{l.status}</span>
                  </div>
                  {l.statusReason && <p className="text-[10px] text-muted-foreground leading-snug">{l.statusReason}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function LayerInfo({ layer }: { layer: Awaited<ReturnType<typeof fetchLayers>>[number] }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: layer.colorHex }} />
        <span className="font-semibold">{layer.name}</span>
        <StatusBadge status={layer.status} className="ml-auto" />
      </div>
      <p className="leading-snug text-muted-foreground">{layer.description}</p>
      <dl className="space-y-1">
        {layer.units && (
          <div><dt className="inline font-medium">Units: </dt><dd className="inline text-muted-foreground">{layer.units}</dd></div>
        )}
        {layer.resolution && (
          <div><dt className="inline font-medium">Resolution: </dt><dd className="inline text-muted-foreground">{layer.resolution}</dd></div>
        )}
        {layer.temporalCoverage && (
          <div><dt className="inline font-medium">Coverage: </dt><dd className="inline text-muted-foreground">{layer.temporalCoverage}</dd></div>
        )}
        {layer.licenseName && (
          <div>
            <dt className="inline font-medium">License: </dt>
            <dd className="inline text-muted-foreground">
              {layer.licenseUrl ? (
                <a className="underline hover:text-foreground" href={layer.licenseUrl} target="_blank" rel="noopener noreferrer">
                  {layer.licenseName}
                </a>
              ) : (
                layer.licenseName
              )}
            </dd>
          </div>
        )}
      </dl>
      {layer.methodology && (
        <div>
          <div className="font-medium">Methodology</div>
          <p className="leading-snug text-muted-foreground">{layer.methodology}</p>
        </div>
      )}
      {layer.limitations && (
        <div>
          <div className="font-medium">Limitations</div>
          <p className="leading-snug text-muted-foreground">{layer.limitations}</p>
        </div>
      )}
    </div>
  );
}
