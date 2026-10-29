"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Crosshair, ExternalLink, Flag, Search, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { fetchEvents, fetchEventsSummary, submitCorrection } from "@/lib/api-client";
import { useAtlas } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";
import { TypeChip, VerificationBadge, Freshness } from "@/components/atlas/ui-bits";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { LAYER_COLOR_BY_EVENT_TYPE_FALLBACK } from "@/components/atlas/event-colors";
import { formatDateSafe } from "@/lib/geo";

export function EventsPanel({ compact = false, onCollapse }: { compact?: boolean; onCollapse?: () => void }) {
  const [type, setType] = useState("all");
  const [kind, setKind] = useState("all");
  const [days, setDays] = useState(365);
  const [filter, setFilter] = useState("");
  const { t, isBn } = useTranslation();

  const summaryQ = useQuery({ queryKey: ["events-summary"], queryFn: fetchEventsSummary, refetchInterval: 120_000 });
  const eventsQ = useQuery({
    queryKey: ["events", type, kind, days],
    queryFn: () => fetchEvents({ type, kind, days, limit: 500 }),
    refetchInterval: 120_000,
  });

  const filtered = useMemo(() => {
    const list = eventsQ.data ?? [];
    if (!filter.trim()) return list;
    const f = filter.toLowerCase();
    return list.filter(
      (e) => e.title.toLowerCase().includes(f) || (e.countryName ?? "").toLowerCase().includes(f) || (e.placeName ?? "").toLowerCase().includes(f),
    );
  }, [eventsQ.data, filter]);

  const { flyTo, openEvent } = useAtlas();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="space-y-3 border-b p-3.5 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t("documentedDisasters")}</h2>
            {onCollapse && (
              <button
                onClick={onCollapse}
                className="hidden h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
                title="Collapse panel"
                aria-label="Collapse panel"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {summaryQ.data && (
              <>
                <span className="tabular-nums">{summaryQ.data.total} {t("totalEvents")}</span>
                <span className="font-semibold text-red-600">{summaryQ.data.activeCount} {t("activeEvents")}</span>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger size="sm" aria-label="Filter by hazard type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger size="sm" aria-label="Filter by event class"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Historical + active</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="historical">Historical only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("searchEventsPlaceholder")} className="pl-8" aria-label="Filter events by text" />
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger size="sm" className="w-[110px]" aria-label="Time window"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="365">12 months</SelectItem>
              <SelectItem value="1095">3 years</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {summaryQ.data?.byType?.length ? (
          <div className="flex flex-wrap gap-1">
            {summaryQ.data.byType.slice(0, compact ? 6 : 12).map((t) => (
              <button
                key={t.eventType}
                onClick={() => setType(type === t.eventType ? "all" : t.eventType)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${type === t.eventType ? "border-foreground bg-foreground text-background" : "hover:bg-accent"}`}
              >
                {EVENT_TYPE_LABELS[t.eventType] ?? t.eventType} · {t.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
        {eventsQ.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        )}
        {eventsQ.isError && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Failed to load events: {(eventsQ.error as Error).message}
          </p>
        )}
        {eventsQ.data?.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            No events match these filters. Try a longer window — imports run on a schedule and the archive grows over time.
          </p>
        )}
        <ul className="space-y-1.5">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                className="w-full rounded-lg border p-2.5 text-left hover:bg-accent/50"
                onClick={() => {
                  openEvent(e);
                  if (e.lat !== null && e.lng !== null) flyTo(e.lat, e.lng, 6);
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{e.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <TypeChip eventType={e.eventType} colorHex={LAYER_COLOR_BY_EVENT_TYPE_FALLBACK[e.eventType]} />
                      <span>
                        {formatDateSafe(e.startDate)}
                        {e.endDate ? ` → ${formatDateSafe(e.endDate)}` : e.kind === "active" ? " (ongoing)" : ""}
                      </span>
                      {e.severityLabel || e.severityValue !== null ? (
                        <span className="font-medium">· {e.severityLabel ?? `${e.severityValue} ${e.severityUnit ?? ""}`.trim()}</span>
                      ) : null}
                    </div>
                  </div>
                  <VerificationBadge status={e.verificationStatus} />
                </div>
              </button>
            </li>
          ))}
        </ul>
        {filtered.length > 0 && eventsQ.data && eventsQ.data.length >= 500 && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Showing the 500 most recent — refine filters to narrow.</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ detail sheet
export function EventDetailSheet() {
  const { selectedEvent, clearEvent, sessionId } = useAtlas();
  const [corrOpen, setCorrOpen] = useState(false);
  if (!selectedEvent) return null;
  const e = selectedEvent;

  return (
    <>
      <Sheet open onOpenChange={(v) => !v && clearEvent()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="p-4 text-left">
            <SheetTitle className="leading-snug">{e.title}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              <TypeChip eventType={e.eventType} colorHex={LAYER_COLOR_BY_EVENT_TYPE_FALLBACK[e.eventType]} />
              <span className="font-medium">{e.kind === "active" ? "Active event" : "Historical event"}</span>
              <VerificationBadge status={e.verificationStatus} />
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4 pt-0">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border p-2.5">
                <dt className="text-muted-foreground">Start</dt>
                <dd className="font-medium">{formatDateSafe(e.startDate)}</dd>
              </div>
              <div className="rounded-lg border p-2.5">
                <dt className="text-muted-foreground">End</dt>
                <dd className="font-medium">{e.endDate ? formatDateSafe(e.endDate) : e.kind === "active" ? "ongoing" : "unknown"}</dd>
              </div>
              <div className="rounded-lg border p-2.5">
                <dt className="text-muted-foreground">Severity (as reported)</dt>
                <dd className="font-medium">{e.severityLabel ?? (e.severityValue !== null ? `${e.severityValue} ${e.severityUnit ?? ""}`.trim() : "not reported")}</dd>
              </div>
              <div className="rounded-lg border p-2.5">
                <dt className="text-muted-foreground">Coordinates</dt>
                <dd className="font-mono font-medium">{e.lat !== null && e.lng !== null ? `${e.lat.toFixed(2)}, ${e.lng.toFixed(2)}` : "—"}</dd>
              </div>
            </dl>

            {e.summary && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h3>
                <p className="text-[13px] leading-snug">{e.summary}</p>
              </div>
            )}

            <div className="rounded-lg border bg-muted/40 p-3">
              <h3 className="text-xs font-semibold">Source & citation</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Aggregated by <span className="font-medium text-foreground">{e.sourceName}</span>. The atlas republishes
                source metadata; verify critical decisions against the original source.
              </p>
              {e.sourceUrl && (
                <a className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium underline" href={e.sourceUrl} target="_blank" rel="noopener noreferrer">
                  Open original source <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {e.sourcePublishedAt && <p className="mt-1 text-[11px] text-muted-foreground">Published: {new Date(e.sourcePublishedAt).toUTCString()}</p>}
              <Freshness at={e.startDate} className="mt-1" />
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={() => setCorrOpen(true)}>
              <Flag className="mr-1.5 h-3.5 w-3.5" /> Report an issue with this event
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <EventCorrectionDialog open={corrOpen} onOpenChange={setCorrOpen} eventId={e.id} eventLabel={e.title} sessionId={sessionId} />
    </>
  );
}

function EventCorrectionDialog({
  open,
  onOpenChange,
  eventId,
  eventLabel,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  eventLabel: string;
  sessionId: string;
}) {
  const [message, setMessage] = useState("");
  void sessionId;
  const submit = useMutation({ mutationFn: (payload: { targetType: string; targetId?: string; targetLabel?: string; message: string }) => submitCorrection(payload) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an event issue</DialogTitle>
          <DialogDescription>{eventLabel}</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="evt-corr">What is wrong? *</Label>
          <Textarea id="evt-corr" value={message} onChange={(ev) => setMessage(ev.target.value)} rows={4} maxLength={2000} placeholder="Describe the problem, ideally with a source link…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={message.trim().length < 10 || submit.isPending}
            onClick={() =>
              submit.mutate(
                { targetType: "event", targetId: eventId, targetLabel: eventLabel, message },
                {
                  onSuccess: () => {
                    toast.success("Correction submitted for review.");
                    onOpenChange(false);
                    setMessage("");
                  },
                  onError: (err: Error) => toast.error(err.message),
                },
              )
            }
          >
            {submit.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OpenOnMapButton({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const { flyTo, setView } = useAtlas();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        setView("map");
        flyTo(lat, lng, zoom);
      }}
    >
      <Crosshair className="mr-1.5 h-3.5 w-3.5" /> Locate on map
    </Button>
  );
}
