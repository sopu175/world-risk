"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X, Bookmark, Flag, AlertTriangle, ExternalLink, MapPin } from "lucide-react";
import { toast } from "sonner";
import { fetchLocationDetail, fetchLocationCompare, submitCorrection } from "@/lib/api-client";
import { useAtlas } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";
import { MiniStat, TypeChip, VerificationBadge, InfoHint } from "@/components/atlas/ui-bits";
import { HotDaysChart, ClimatologyChart, QuakesPerYearChart, PM25Chart, AnnualMaxWindChart } from "@/components/atlas/charts";
import { formatCoord, formatDateSafe, haversineKm } from "@/lib/geo";

// --------------------------------------------------------------- payload schemas
const quakeDataSchema = z.object({
  count10y: z.number(),
  maxMag10y: z.number().nullable(),
  perYear: z.array(z.object({ year: z.number(), count: z.number(), maxMag: z.number() })),
  events: z.array(
    z.object({ id: z.string(), date: z.string(), mag: z.number(), depthKm: z.number().nullable(), place: z.string().nullable(), url: z.string().nullable() }),
  ),
});

const heatDataSchema = z.object({
  thresholdC: z.number(),
  baselineHotDaysPerYear: z.number(),
  recentHotDaysPerYear: z.number().nullable(),
  trendDeltaPct: z.number().nullable(),
  coverageStart: z.number(),
  coverageEnd: z.number(),
  annualSeries: z.array(z.object({ year: z.number(), hotDays: z.number(), maxTmaxC: z.number().nullable() })),
  climatology: z.array(z.object({ month: z.string(), meanTmaxC: z.number() })),
});

const airDataSchema = z.object({
  pm25Current: z.number().nullable(),
  pm25Last24hMean: z.number().nullable(),
  category: z.object({ label: z.string(), color: z.string() }).nullable(),
  hourly: z.array(z.object({ time: z.string(), pm25: z.number().nullable() })),
  hoursCovered: z.number(),
});

const windDataSchema = z.object({
  current: z
    .object({
      speedKmh: z.number(),
      gustKmh: z.number().nullable(),
      dirDeg: z.number().nullable(),
      dirCompass: z.string().nullable(),
      beaufortB: z.number(),
      beaufortName: z.string(),
    })
    .nullable(),
  next48hPeakGustKmh: z.number().nullable(),
  strongWindThresholdKmh: z.number(),
  baselineAnnualMaxWindKmh: z.number(),
  recentAnnualMaxWindKmh: z.number().nullable(),
  baselineStrongWindDaysPerYear: z.number(),
  recentStrongWindDaysPerYear: z.number().nullable(),
  coverageStart: z.number(),
  coverageEnd: z.number(),
  annualSeries: z.array(
    z.object({
      year: z.number(),
      maxWindKmh: z.number().nullable(),
      maxGustKmh: z.number().nullable(),
      strongWindDays: z.number(),
    }),
  ),
});

type QuakeData = z.infer<typeof quakeDataSchema>;
type HeatData = z.infer<typeof heatDataSchema>;
type AirData = z.infer<typeof airDataSchema>;
type WindData = z.infer<typeof windDataSchema>;

function parseIndicator<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const r = schema.safeParse(data);
  return r.success ? r.data : null;
}

// --------------------------------------------------------------- component
export function LocationPanel() {
  const { selectedLocation, clearLocation, sessionId } = useAtlas();
  const { t, isBn } = useTranslation();
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const detailQ = useQuery({
    queryKey: ["location", selectedLocation?.latitude, selectedLocation?.longitude, selectedLocation?.name],
    queryFn: () => fetchLocationDetail(selectedLocation!),
    enabled: !!selectedLocation,
    staleTime: 10 * 60_000,
    retry: 0,
  });

  if (!selectedLocation) return null;
  const loc = selectedLocation;

  return (
    <>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 flex items-start gap-2 border-b bg-background p-4 z-10">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight">
              {detailQ.data?.location.name ?? loc.name ?? (isBn ? "নির্বাচিত স্থান" : "Selected location")}
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {formatCoord(loc.latitude, loc.longitude)}
              {detailQ.data?.location.country ? ` · ${detailQ.data.location.country}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {detailQ.data?.location.admin1 ? `${detailQ.data.location.admin1} · ` : ""}
              {detailQ.data?.location.elevationM != null ? `${Math.round(detailQ.data.location.elevationM)} m elev. · ` : ""}
              {detailQ.data?.location.localTime ? `local ${detailQ.data.location.localTime.slice(11, 16)}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={clearLocation} aria-label={t("closePanel")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="space-y-4 p-4">
            {detailQ.isLoading && <LocationSkeleton />}
            {detailQ.isError && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                Could not build the location profile: {(detailQ.error as Error).message}
              </p>
            )}

            {detailQ.data && (
              <>
                <IndicatorOverview
                  quake={detailQ.data.indicators.find((i) => i.key === "earthquake_history")}
                  heat={detailQ.data.indicators.find((i) => i.key === "extreme_heat")}
                  air={detailQ.data.indicators.find((i) => i.key === "air_quality")}
                  wind={parseIndicator(windDataSchema, detailQ.data.indicators.find((i) => i.key === "wind")?.data)}
                  windIndicator={detailQ.data.indicators.find((i) => i.key === "wind")}
                />

                <div className="flex gap-2">
                  <SaveLocationButton sessionId={sessionId} label={detailQ.data.location.name} latitude={loc.latitude} longitude={loc.longitude} countryName={detailQ.data.location.country ?? undefined} />
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setCorrectionOpen(true)}>
                    <Flag className="mr-1.5 h-3.5 w-3.5" /> {t("reportIssue")}
                  </Button>
                </div>

                <Tabs defaultValue="trends">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="trends">{t("tabTrends")}</TabsTrigger>
                    <TabsTrigger value="compare">{t("tabCompare")}</TabsTrigger>
                    <TabsTrigger value="sources">{t("tabSources")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="trends" className="mt-3 space-y-5">
                    <TrendsSection
                      quake={parseIndicator(quakeDataSchema, detailQ.data.indicators.find((i) => i.key === "earthquake_history")?.data)}
                      heat={parseIndicator(heatDataSchema, detailQ.data.indicators.find((i) => i.key === "extreme_heat")?.data)}
                      air={parseIndicator(airDataSchema, detailQ.data.indicators.find((i) => i.key === "air_quality")?.data)}
                      wind={parseIndicator(windDataSchema, detailQ.data.indicators.find((i) => i.key === "wind")?.data)}
                    />
                  </TabsContent>

                  <TabsContent value="compare" className="mt-3">
                    <CompareSection latitude={loc.latitude} longitude={loc.longitude} />
                  </TabsContent>

                  <TabsContent value="sources" className="mt-3 space-y-3">
                    {detailQ.data.indicators.map((ind) => (
                      <SourceBlock key={ind.key} indicator={ind} />
                    ))}
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <div className="text-xs font-semibold">Data-quality & confidence</div>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-snug text-muted-foreground">
                        {detailQ.data.disclaimers.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Profile generated {new Date(detailQ.data.generatedAt).toUTCString()}</p>
                  </TabsContent>
                </Tabs>

                <NearbyEventsSection
                  events={detailQ.data.nearbyEvents.events}
                  radiusKm={detailQ.data.nearbyEvents.radiusKm}
                  latitude={loc.latitude}
                  longitude={loc.longitude}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <CorrectionDialog
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        targetLabel={`${detailQ.data?.location.name ?? "Location"} (${formatCoord(loc.latitude, loc.longitude)})`}
      />
    </>
  );
}

// ------------------------------------------------------------------ overview
function IndicatorOverview({
  quake,
  heat,
  air,
  wind,
  windIndicator,
}: {
  quake?: { available: boolean; valueSummary: string | null; unavailableReason: string | null };
  heat?: { available: boolean; valueSummary: string | null; unavailableReason: string | null };
  air?: { available: boolean; valueSummary: string | null; unavailableReason: string | null };
  wind?: WindData;
  windIndicator?: { available: boolean; valueSummary: string | null; unavailableReason: string | null };
}) {
  const { isBn } = useTranslation();
  const windAvail = windIndicator?.available ?? false;
  const windValue = wind?.current ? `${Math.round(wind.current.speedKmh)} km/h` : "—";
  const windSub = wind?.current
    ? `B${wind.current.beaufortB} ${wind.current.beaufortName}${wind.current.gustKmh !== null ? ` · gusts ${Math.round(wind.current.gustKmh)} km/h` : ""}`
    : windAvail
      ? `${isBn ? "বার্ষিক সর্বোচ্চ" : "annual max"} ≈ ${wind?.baselineAnnualMaxWindKmh ?? "—"} km/h`
      : isBn ? "বায়ু মডেল অনুপলব্ধ" : "Wind model unavailable";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MiniStat
        label={isBn ? "ভূমিকম্প (১০ বছর)" : "Quakes M≥4.5 / 10 y"}
        value={quake?.available ? (quake.valueSummary?.split(" ")[0] ?? "—") : "—"}
        sub={quake?.available ? quake.valueSummary?.match(/max M ([\d.]+)/)?.[0] ?? undefined : isBn ? "USGS ক্যাটালগ অনুপলব্ধ" : "USGS catalog unavailable"}
      />
      <MiniStat
        label={isBn ? "উষ্ণ দিন / বছর" : "Hot days / year"}
        value={heat?.available ? (heat.valueSummary?.split(" ")[0] ?? "—") : "—"}
        sub={heat?.available ? heat.valueSummary?.replace(/^\d+(\.\d+)?\s*/, "").slice(0, 44) : isBn ? "ERA5 অনুপলব্ধ" : "ERA5 unavailable"}
      />
      <MiniStat
        label={isBn ? "PM2.5 (২৪ ঘণ্টা)" : "PM2.5 (24 h)"}
        value={air?.available ? `${air.valueSummary?.match(/PM2\.5 ([\d.]+)/)?.[1] ?? "—"} µg/m³` : "—"}
        sub={air?.available ? air.valueSummary?.split("— ")[1] ?? undefined : isBn ? "CAMS অনুপলব্ধ" : "CAMS unavailable"}
      />
      <MiniStat label={isBn ? "বর্তমান বাতাস" : "Wind now"} value={windAvail ? windValue : "—"} sub={windSub.slice(0, 44)} />
    </div>
  );
}

// ------------------------------------------------------------------- trends
function TrendsSection({
  quake,
  heat,
  air,
  wind,
}: {
  quake: QuakeData | null;
  heat: HeatData | null;
  air: AirData | null;
  wind: WindData | null;
}) {
  if (!quake && !heat && !air && !wind) {
    return <InfoHint>Indicator series are unavailable right now — see the Sources tab for reasons.</InfoHint>;
  }
  return (
    <>
      {wind && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Annual max wind (ERA5, {wind.coverageStart}–{wind.coverageEnd})
          </h3>
          <AnnualMaxWindChart data={wind.annualSeries} strongWindThresholdKmh={wind.strongWindThresholdKmh} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Period mean {wind.baselineAnnualMaxWindKmh} km/h{wind.recentAnnualMaxWindKmh !== null ? `, last 5 years ${wind.recentAnnualMaxWindKmh} km/h` : ""}.
            {" "}Strong-wind days (≥ {wind.strongWindThresholdKmh} km/h, Beaufort 6): {wind.baselineStrongWindDaysPerYear}/yr on average
            {wind.recentStrongWindDaysPerYear !== null ? `, ${wind.recentStrongWindDaysPerYear}/yr in the last 5 years` : ""}.
            {wind.current && (
              <> Now: {wind.current.speedKmh} km/h (B{wind.current.beaufortB} {wind.current.beaufortName}){wind.current.gustKmh !== null ? `, gusts ${Math.round(wind.current.gustKmh)} km/h` : ""}{wind.current.dirCompass ? ` from ${wind.current.dirCompass}` : ""}.</>
            )}
            {wind.next48hPeakGustKmh !== null && <> Peak gust next 48 h: {wind.next48hPeakGustKmh} km/h.</>}
          </p>
        </section>
      )}
      <Separator />
      {heat && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hot days per year (ERA5, {heat.coverageStart}–{heat.coverageEnd}, Tmax ≥ {heat.thresholdC} °C)
          </h3>
          <HotDaysChart data={heat.annualSeries} thresholdC={heat.thresholdC} />
          {heat.trendDeltaPct !== null && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Last 5 complete years vs period mean: <span className="font-semibold">{heat.trendDeltaPct >= 0 ? "+" : ""}{heat.trendDeltaPct}%</span> ({heat.baselineHotDaysPerYear} → {heat.recentHotDaysPerYear} days/yr). Grid-cell average — not a street-level estimate.
            </p>
          )}
          <h4 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly climate of daily maxima</h4>
          <ClimatologyChart data={heat.climatology} />
        </section>
      )}
      <Separator />
      {quake && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Earthquakes per year (M ≥ 4.5, within 300 km, USGS)
          </h3>
          <QuakesPerYearChart data={quake.perYear} />
        </section>
      )}
      <Separator />
      {air && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            PM2.5 — past 72 h (CAMS model)
          </h3>
          <PM25Chart data={air.hourly} />
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ compare
function CompareSection({ latitude, longitude }: { latitude: number; longitude: number }) {
  const cmpQ = useQuery({
    queryKey: ["compare", latitude.toFixed(1), longitude.toFixed(1)],
    queryFn: () => fetchLocationCompare({ latitude, longitude }),
    staleTime: 30 * 60_000,
  });

  if (cmpQ.isLoading) return <Skeleton className="h-48 w-full" />;
  if (cmpQ.isError) {
    return <p className="text-xs text-muted-foreground">Comparison unavailable: {(cmpQ.error as Error).message}</p>;
  }
  const rows = cmpQ.data ?? [];
  return (
    <div className="space-y-2">
      <InfoHint>
        Identical ERA5/USGS methodology across locations. Comparisons describe area-level exposure — not street-level
        safety anywhere.
      </InfoHint>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-2.5 py-2 font-medium">Location</th>
              <th className="px-2 py-2 text-right font-medium" title="Hot days per year, full-period mean">Hot d/yr</th>
              <th className="px-2 py-2 text-right font-medium" title="Hot days per year, last 5 complete years">Recent</th>
              <th className="px-2 py-2 text-right font-medium" title="Quakes M≥4.5 within 300 km, 10 y">Quakes 10y</th>
              <th className="px-2 py-2 text-right font-medium" title="Strongest in period">Max M</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.name}-${r.latitude}`} className={r.isCurrent ? "bg-teal-50/60 font-medium dark:bg-teal-950/40" : "border-t"}>
                <td className="px-2.5 py-2">
                  {r.name}
                  {r.country && !r.isCurrent ? <span className="text-muted-foreground"> — {r.country}</span> : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.hotDaysBaseline ?? "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.hotDaysRecent ?? "—"}
                  {r.trendDeltaPct !== null ? (
                    <span className={r.trendDeltaPct >= 0 ? " text-red-600 dark:text-red-400" : " text-emerald-600 dark:text-emerald-400"}>
                      {" "}{r.trendDeltaPct >= 0 ? "+" : ""}{r.trendDeltaPct}%
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.quakes10y ?? "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.maxMag10y ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Reference cities are computed on demand with server-side caching.</p>
    </div>
  );
}

// ------------------------------------------------------------------ sources
function SourceBlock({ indicator }: { indicator: { key: string; name: string; available: boolean; unavailableReason: string | null; source: { name: string; provider: string; url: string; licenseName: string; licenseUrl: string; lastSuccessAt: string | null; datasetVersion: string | null }; methodology: string | null; limitations: string | null } }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{indicator.name}</span>
        <span className={indicator.available ? "text-[10px] font-medium text-emerald-700 dark:text-emerald-400" : "text-[10px] font-medium text-amber-700 dark:text-amber-400"}>
          {indicator.available ? "AVAILABLE" : "UNAVAILABLE"}
        </span>
      </div>
      {!indicator.available && indicator.unavailableReason && (
        <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">{indicator.unavailableReason}</p>
      )}
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        Source:{" "}
        <a className="underline hover:text-foreground" href={indicator.source.url} target="_blank" rel="noopener noreferrer">
          {indicator.source.name} <ExternalLink className="inline h-3 w-3" />
        </a>
        {" · "}License:{" "}
        <a className="underline hover:text-foreground" href={indicator.source.licenseUrl} target="_blank" rel="noopener noreferrer">
          {indicator.source.licenseName}
        </a>
      </div>
      {indicator.source.lastSuccessAt && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">Data as of {new Date(indicator.source.lastSuccessAt).toUTCString()}</div>
      )}
      {indicator.methodology && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{indicator.methodology}</p>}
      {indicator.limitations && (
        <p className="mt-1 text-[11px] leading-snug text-amber-800/90 dark:text-amber-300/90">Limitations: {indicator.limitations}</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------ nearby events
function NearbyEventsSection({
  events,
  radiusKm,
  latitude,
  longitude,
}: {
  events: { id: string; title: string; eventType: string; kind: string; startDate: string | null; severityLabel: string | null; lat: number | null; lng: number | null; verificationStatus: string; sourceName: string; sourceUrl: string | null }[];
  radiusKm: number;
  latitude: number;
  longitude: number;
}) {
  const { openEvent, flyTo } = useAtlas();
  const sorted = useMemo(
    () =>
      events
        .map((e) => ({ ...e, distanceKm: e.lat !== null && e.lng !== null ? haversineKm(latitude, longitude, e.lat, e.lng) : null }))
        .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? "")),
    [events, latitude, longitude],
  );

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Documented events within {radiusKm} km (12 months)
      </h3>
      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          No documented events from the imported sources in this radius. Absence of reports is not proof of absence of
          hazard — see Sources & limitations.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((e) => (
            <li key={e.id} className="rounded-lg border p-2.5">
              <div className="flex items-center gap-2">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    openEvent(e as never);
                    if (e.lat !== null && e.lng !== null) flyTo(e.lat, e.lng, 6);
                  }}
                >
                  <div className="truncate text-[13px] font-medium hover:underline">{e.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <TypeChip eventType={e.eventType} />
                    <span>{formatDateSafe(e.startDate)}</span>
                    {e.distanceKm !== null && <span>· {Math.round(e.distanceKm)} km</span>}
                    {e.kind === "active" && <span className="font-semibold text-red-600 dark:text-red-400">· ACTIVE</span>}
                  </div>
                </button>
                <VerificationBadge status={e.verificationStatus} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------ save + correct
function SaveLocationButton({
  sessionId,
  label,
  latitude,
  longitude,
  countryName,
}: {
  sessionId: string;
  label: string;
  latitude: number;
  longitude: number;
  countryName?: string;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      fetch("/api/saved-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, label, latitude, longitude, countryName }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error?.message ?? "Save failed");
        return r.json();
      }),
    onSuccess: () => {
      toast.success("Location saved to this session");
      qc.invalidateQueries({ queryKey: ["saved", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const { t } = useTranslation();
  return (
    <Button variant="outline" size="sm" className="flex-1" onClick={() => save.mutate()} disabled={save.isPending}>
      <Bookmark className="mr-1.5 h-3.5 w-3.5" /> {t("saveLocation")}
    </Button>
  );
}

function CorrectionDialog({
  open,
  onOpenChange,
  targetLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetLabel: string;
}) {
  const [message, setMessage] = useState("");
  const [field, setField] = useState("");
  const [proposed, setProposed] = useState("");
  const [email, setEmail] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      submitCorrection({
        targetType: "location",
        targetLabel,
        field: field || undefined,
        proposedValue: proposed || undefined,
        message,
        submitterEmail: email || undefined,
      }),
    onSuccess: () => {
      toast.success("Correction submitted — a data steward will review it.");
      onOpenChange(false);
      setMessage("");
      setField("");
      setProposed("");
      setEmail("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a data issue</DialogTitle>
          <DialogDescription>
            Tell us what looks wrong about <span className="font-medium">{targetLabel}</span>. Cite a source where possible.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="corr-field">What is wrong? (optional)</Label>
            <Input id="corr-field" value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. indicator value, event date, place name" maxLength={60} />
          </div>
          <div>
            <Label htmlFor="corr-proposed">Suggested correction (optional)</Label>
            <Input id="corr-proposed" value={proposed} onChange={(e) => setProposed(e.target.value)} placeholder="What should it say instead?" maxLength={500} />
          </div>
          <div>
            <Label htmlFor="corr-message">Details *</Label>
            <Textarea id="corr-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the issue and link your evidence…" rows={4} maxLength={2000} />
          </div>
          <div>
            <Label htmlFor="corr-email">Your email (optional, for follow-up)</Label>
            <Input id="corr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={message.trim().length < 10 || submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px]" />
        ))}
      </div>
      <Skeleton className="h-[220px]" />
      <Skeleton className="h-[200px]" />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 animate-pulse" /> Querying seismic catalog, reanalysis climate series and air
        quality — typically 2–6 s on first view.
      </p>
    </div>
  );
}
