"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchLayers } from "@/lib/api-client";
import { StatusBadge } from "@/components/atlas/ui-bits";
import { AlertTriangle, Scale, CircleDashed } from "lucide-react";

export function MethodologyPanel() {
  const layersQ = useQuery({ queryKey: ["layers"], queryFn: fetchLayers, refetchInterval: 60_000 });
  const layers = layersQ.data ?? [];

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6 pb-16">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Methodology, data sources & limitations</h1>
          <p className="text-sm text-muted-foreground">
            WorldRisk Atlas publishes only what its configured sources actually provide. Where data is missing, outdated
            or uncertain, the platform says so instead of filling gaps.
          </p>
        </header>

        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> What this platform is not
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-snug text-amber-900/90 dark:text-amber-200/90">
            <li>Country-level indicators do not describe street-level conditions. A “high seismicity” country does not make every address dangerous, and a “low” one does not make any address safe.</li>
            <li>Absence of recorded events is not proof of absence of hazard — reporting completeness varies by region and period.</li>
            <li>Indicators are area averages (25–40 km grid cells, 300 km catalog windows). They are not engineering assessments and must not replace local building codes, official warnings or professional due diligence.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CircleDashed className="h-4 w-4" /> Hazard layers & methodology
          </h2>
          <div className="space-y-2">
            {layersQ.isLoading && <p className="text-xs text-muted-foreground">Loading layer registry…</p>}
            {layers.map((l) => (
              <div key={l.key} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.colorHex }} />
                  <span className="text-[13px] font-semibold">{l.name}</span>
                  <StatusBadge status={l.status} />
                  <span className="text-[11px] text-muted-foreground">{l.recordCount.toLocaleString()} records</span>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{l.description}</p>
                {l.methodology && <p className="mt-1 text-xs leading-snug"><span className="font-medium">Method:</span> {l.methodology}</p>}
                {l.limitations && <p className="mt-1 text-xs leading-snug text-amber-800 dark:text-amber-300"><span className="font-medium">Limitations:</span> {l.limitations}</p>}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Scale className="h-4 w-4" /> Sources, licensing & attribution
          </h2>
          <div className="overflow-hidden rounded-lg border text-xs">
            <table className="w-full">
              <thead className="bg-muted/70 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 font-medium">Used for</th>
                  <th className="px-2 py-2 font-medium">License</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["U.S. Geological Survey — Earthquake Hazards Program", "earthquake layer, location seismic history", "Public domain (U.S. Government)", "https://www.usgs.gov/information-policies-and-instructions"],
                  ["NASA EONET v3", "documented events: wildfire, flood, cyclone, drought, landslide, volcano", "Public domain (NASA)", "https://eonet.gsfc.nasa.gov/api/v3"],
                  ["Open-Meteo (ERA5 / CAMS / GeoNames)", "heat profile, PM2.5, geocoding", "CC-BY 4.0", "https://open-meteo.com/en/license"],
                  ["OpenStreetMap Nominatim", "reverse geocoding", "ODbL 1.0", "https://www.openstreetmap.org/copyright"],
                  ["OpenFreeMap + OpenMapTiles + OpenStreetMap", "neutral basemap (Positron / dark)", "Free, no key — © OpenStreetMap contributors", "https://openfreemap.org/"],
                ].map(([name, use, license, url]) => (
                  <tr key={name} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      <a className="underline hover:text-foreground" href={url} target="_blank" rel="noopener noreferrer">{name}</a>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{use}</td>
                    <td className="px-2 py-2 text-muted-foreground">{license}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            ReliefWeb (UN OCHA) and NASA FIRMS are registered in the source catalog but disabled until their free
            credentials are configured (RELIEFWEB_APPNAME, FIRMS_MAP_KEY). The atlas never substitutes estimates for
            unconfigured sources.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Verification statuses</h2>
          <ul className="mt-2 space-y-1 text-[13px] leading-snug text-muted-foreground">
            <li><span className="font-medium text-foreground">Cross-verified</span> — the event is corroborated by two or more official sources in the upstream feed.</li>
            <li><span className="font-medium text-foreground">Source-reported</span> — published by one official aggregator; the atlas has not independently confirmed it.</li>
            <li><span className="font-medium text-foreground">Unverified</span> — found in the feed but not attributable to an official source.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Data pipeline & quality controls</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-snug text-muted-foreground">
            <li>Every import is schema-validated (Zod server-side); invalid records are counted and reported, never silently dropped or patched over.</li>
            <li>Records are deduplicated on provider-native IDs; only genuinely new or revised rows are written.</li>
            <li>Each run is audited (records fetched/inserted/updated/skipped/invalid, dataset version, duration, errors).</li>
            <li>Failed imports never overwrite valid existing data. Sources pause themselves after 5 consecutive failures (visible as an \"unavailable\" state with the reason) and resume automatically once the upstream recovers.</li>
            <li>Outbound requests are HTTPS-only and restricted to the documented source allow-list (SSRF protection).</li>
            <li>User-submitted corrections are queued for review by data stewards — nothing is silently edited.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Platform roadmap (monetization-ready architecture)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-snug text-muted-foreground">
            <li><span className="font-medium text-foreground">Free public access</span> — the entire current experience.</li>
            <li><span className="font-medium text-foreground">Premium reports & portfolio monitoring</span> — saved-location alerts and scheduled PDF/location reports (schema extension points already present: saved_location, entitlements module planned).</li>
            <li><span className="font-medium text-foreground">Business API</span> — the REST contract (/api/layers, /api/observations, /api/events with bbox) is designed to be metered per subscription tier.</li>
            <li><span className="font-medium text-foreground">Bulk exports</span> — dataset-scoped CSV/GeoJSON exports behind the same entitlements layer.</li>
          </ul>
        </section>
      </div>
    </ScrollArea>
  );
}
