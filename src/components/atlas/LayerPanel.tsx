"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MapPin, Info, Loader2 } from "lucide-react";
import { fetchLayers, searchLocations } from "@/lib/api-client";
import { useAtlas } from "@/lib/store";
import { StatusBadge, Freshness } from "@/components/atlas/ui-bits";
import { EARTHQUAKE_MAGNITUDE_LEGEND } from "@/lib/hazard-meta";
import type { GeoSearchResult, LayerDTO } from "@/lib/types";

const COORD_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export function LayerPanel({ onLocate }: { onLocate?: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const { activeLayers, toggleLayer, setLocation, flyTo } = useAtlas();

  // Radix Popover IDs differ between SSR and client renders; render the
  // interactive layer list only after hydration to keep the SSR HTML free of
  // generated IDs (prevents hydration attribute mismatches).
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

  const layers = (layersQ.data as LayerDTO[] | undefined) ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* ------------------------------------------------ search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search city, region — or paste lat, lng"
          className="pl-8"
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
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={chooseCoord}
                >
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{coordMatch.latitude}, {coordMatch.longitude}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">coordinates</span>
                </button>
              )}
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => choose(r)}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {r.name}
                    {r.admin1 ? <span className="text-muted-foreground">, {r.admin1}</span> : null}
                    {r.country ? <span className="text-muted-foreground"> — {r.country}</span> : null}
                  </span>
                  {r.population ? (
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {(r.population / 1000).toFixed(0)}k
                    </span>
                  ) : null}
                </button>
              ))}
              <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                Geocoding: Open-Meteo / GeoNames (CC-BY 4.0)
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* ------------------------------------------------ layers */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hazard layers</h2>
        {layersQ.isFetching && !layers.length && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {layersQ.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {layersQ.isError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Failed to load the layer registry. The API may be restarting — retrying automatically.
        </p>
      )}

      <ul className="space-y-1" aria-label="Hazard layers">
        {mounted &&
          layers.map((l) => {
          const canToggle = l.mapAvailable && l.status === "live";
          const on = activeLayers.includes(l.key);
          return (
            <li key={l.key} className="rounded-lg border border-transparent px-2 py-1.5 hover:border-border hover:bg-accent/40">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.colorHex }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{l.name}</span>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {l.status === "live" ? (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {l.recordCount.toLocaleString()} records
                      </span>
                    ) : null}
                    {l.lastUpdatedAt ? <Freshness at={l.lastUpdatedAt} /> : null}
                  </div>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={`About the ${l.name} layer`}
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
                  disabled={!canToggle}
                  onCheckedChange={() => toggleLayer(l.key)}
                  aria-label={`Toggle ${l.name} layer`}
                />
              </div>
              {l.status !== "live" && l.statusReason ? (
                <p className="mt-1 pl-5 text-[11px] leading-snug text-muted-foreground">{l.statusReason}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* ------------------------------------------------ legend */}
      {activeLayers.includes("earthquake") && (
        <div className="rounded-lg border p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Legend — earthquake magnitude
          </div>
          <ul className="space-y-1">
            {EARTHQUAKE_MAGNITUDE_LEGEND.map((b) => (
              <li key={b.label} className="flex items-center gap-2 text-xs">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                {b.label}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Active events (from NASA EONET) carry a soft halo. Circle size scales with magnitude and zoom.
          </div>
        </div>
      )}

      <p className="mt-auto text-[11px] leading-snug text-muted-foreground">
        Only layers with a configured, validated data source are toggleable. Click anywhere on the map to inspect that
        location.
      </p>
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
