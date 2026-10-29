"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, KeyRound, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { fetchAdminOverview, patchAdminSource, patchAdminCorrection, runAdminIngest } from "@/lib/api-client";
import { useAtlas } from "@/lib/store";
import { StatusBadge, Freshness, MiniStat } from "@/components/atlas/ui-bits";

export function AdminPanel() {
  const { adminToken, setAdminToken } = useAtlas();
  const [tokenInput, setTokenInput] = useState("");
  const [authFailed, setAuthFailed] = useState(false);

  const overviewQ = useQuery({
    queryKey: ["admin-overview", adminToken],
    queryFn: async () => {
      try {
        const d = await fetchAdminOverview(adminToken);
        setAuthFailed(false);
        return d;
      } catch (e) {
        if ((e as Error & { status?: number }).status === 401) setAuthFailed(true);
        throw e;
      }
    },
    refetchInterval: 30_000,
    retry: false,
  });

  if (authFailed && !adminToken) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-8">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4" /> Admin token required
        </div>
        <p className="text-xs text-muted-foreground">
          This deployment sets <code className="rounded bg-muted px-1">ADMIN_TOKEN</code>. Enter it to manage data
          sources and ingestion.
        </p>
        <div className="flex gap-2">
          <Input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="Admin token" />
          <Button onClick={() => setAdminToken(tokenInput)}>Unlock</Button>
        </div>
      </div>
    );
  }

  const d = overviewQ.data;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Admin & data operations</h1>
        {d?.adminAuthMode === "open" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <ShieldAlert className="h-3 w-3" /> Open mode — set ADMIN_TOKEN in production
          </span>
        )}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => overviewQ.refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {overviewQ.isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)}
        </div>
      )}
      {overviewQ.isError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Admin overview unavailable: {(overviewQ.error as Error).message}
        </p>
      )}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="Observations" value={d.stats.observations.toLocaleString()} sub="earthquake records" />
            <MiniStat label="Disaster events" value={d.stats.events.toLocaleString()} sub="documented events" />
            <MiniStat label="Bulk sources live" value={String(d.stats.sourcesActive)} sub={`${d.stats.sourcesNeedsConfig} need config`} />
            <MiniStat label="Open corrections" value={String(d.stats.openCorrections)} sub={`${d.stats.totalCorrections} submitted total`} />
          </div>

          <Tabs defaultValue="sources" className="mt-4">
            <TabsList>
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="runs">Import history</TabsTrigger>
              <TabsTrigger value="coverage">Coverage</TabsTrigger>
              <TabsTrigger value="corrections">Corrections {d.stats.openCorrections > 0 ? `(${d.stats.openCorrections})` : ""}</TabsTrigger>
            </TabsList>

            <TabsContent value="sources">
              <SourcesTab overview={d} />
            </TabsContent>
            <TabsContent value="runs">
              <RunsTab overview={d} />
            </TabsContent>
            <TabsContent value="coverage">
              <CoverageTab overview={d} />
            </TabsContent>
            <TabsContent value="corrections">
              <CorrectionsTab overview={d} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- sources
function SourcesTab({ overview }: { overview: AdminOverviewType }) {
  const { adminToken } = useAtlas();
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: (args: { key: string; enabled: boolean }) => patchAdminSource(adminToken, args),
    onSuccess: () => {
      toast.success("Source updated");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["layers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNow = useMutation({
    mutationFn: (sources?: string[]) => runAdminIngest(adminToken, { sources, trigger: "manual" }),
    onSuccess: (res) => {
      const failed = res.outcomes.filter((o) => o.status === "failed").length;
      const skipped = res.outcomes.filter((o) => o.status === "skipped").length;
      toast.success(`Ingestion finished — ${res.outcomes.length - failed - skipped} imported, ${failed} failed, ${skipped} skipped`);
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["layers"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["obs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => runNow.mutate(undefined)} disabled={runNow.isPending}>
          {runNow.isPending ? "Running…" : "Run all eligible now"}
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <ScrollArea className="max-h-[520px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/90 text-left backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Last success</th>
                <th className="px-2 py-2 text-right font-medium">Cadence</th>
                <th className="px-2 py-2 text-right font-medium">Records</th>
                <th className="px-2 py-2 text-center font-medium">Enabled</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {overview.sources.map((s) => (
                <tr key={s.key} className="border-t align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.provider} · {s.accessMode}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {s.requiresApiKeyEnv && (
                        <Badge variant={s.apiKeyPresent ? "default" : "secondary"} className="text-[10px]">
                          {s.apiKeyPresent ? `${s.requiresApiKeyEnv} set` : `${s.requiresApiKeyEnv} missing`}
                        </Badge>
                      )}
                      <a className="text-[10px] underline text-muted-foreground hover:text-foreground" href={s.licenseUrl} target="_blank" rel="noopener noreferrer">
                        {s.licenseName}
                      </a>
                    </div>
                    {s.statusReason && <p className="mt-1 max-w-md text-[11px] text-amber-800 dark:text-amber-300">{s.statusReason}</p>}
                  </td>
                  <td className="px-2 py-2.5"><StatusBadge status={s.status} /></td>
                  <td className="px-2 py-2.5"><Freshness at={s.lastSuccessAt} /></td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{s.accessMode === "bulk" ? `${s.cadenceHours} h` : "on demand"}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{(s.observationCount || s.eventCount || 0).toLocaleString()}</td>
                  <td className="px-2 py-2.5 text-center">
                    {s.accessMode === "bulk" && (
                      <Switch checked={s.enabled} onCheckedChange={(v) => toggle.mutate({ key: s.key, enabled: v })} aria-label={`Toggle ${s.key}`} />
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {s.accessMode === "bulk" && s.enabled && s.status !== "needs_config" && (
                      <Button size="sm" variant="outline" onClick={() => runNow.mutate([s.key])} disabled={runNow.isPending}>
                        Run
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Disabling a source stops future imports but never deletes validated data. Auto-disable triggers after 5
        consecutive failed imports; re-enable to reset the failure counter.
      </p>
    </div>
  );
}

type AdminOverviewType = Awaited<ReturnType<typeof fetchAdminOverview>>;

// --------------------------------------------------------------------- runs
function RunsTab({ overview }: { overview: AdminOverviewType }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <ScrollArea className="max-h-[520px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/90 text-left backdrop-blur">
            <tr>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-2 py-2 font-medium">Source</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 text-right font-medium">Fetched</th>
              <th className="px-2 py-2 text-right font-medium">+ Ins</th>
              <th className="px-2 py-2 text-right font-medium">~ Upd</th>
              <th className="px-2 py-2 text-right font-medium">Skip</th>
              <th className="px-2 py-2 text-right font-medium">Invalid</th>
              <th className="px-2 py-2 text-right font-medium">ms</th>
              <th className="px-2 py-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {overview.runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{new Date(r.startedAt).toLocaleString()}</td>
                <td className="px-2 py-2">{r.sourceKey}</td>
                <td className="px-2 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-2 py-2 text-right tabular-nums">{r.recordsFetched}</td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{r.recordsInserted}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.recordsUpdated}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.recordsSkipped}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${r.recordsInvalid > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`}>{r.recordsInvalid}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.durationMs ?? "—"}</td>
                <td className="max-w-[280px] truncate px-2 py-2 text-[11px] text-muted-foreground" title={r.errorMessage ?? ""}>{r.errorMessage ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

// ----------------------------------------------------------------- coverage
function CoverageTab({ overview }: { overview: AdminOverviewType }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Records per layer</h3>
        <ul className="space-y-2">
          {overview.coverage.byLayer.map((c) => (
            <li key={c.layerKey}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium capitalize">{c.layerKey}</span>
                <span className="tabular-nums">{c.count.toLocaleString()}</span>
              </div>
              <div className="mt-0.5 flex justify-between">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${Math.min(100, (c.count / Math.max(...overview.coverage.byLayer.map((x) => x.count), 1)) * 100)}%` }}
                  />
                </div>
                <Freshness at={c.lastAt} className="ml-2 w-32 justify-end" />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Events by type</h3>
        <ul className="space-y-1.5">
          {overview.coverage.eventsByType.map((t) => (
            <li key={t.eventType} className="flex items-baseline justify-between text-xs">
              <span className="font-medium capitalize">{t.eventType}</span>
              <span className="tabular-nums text-muted-foreground">{t.count.toLocaleString()} · last {t.lastAt ? new Date(t.lastAt).toISOString().slice(0, 10) : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- corrections
function CorrectionsTab({ overview }: { overview: AdminOverviewType }) {
  const { adminToken } = useAtlas();
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const patch = useMutation({
    mutationFn: (args: { id: string; status: string; adminNote?: string }) => patchAdminCorrection(adminToken, args),
    onSuccess: () => {
      toast.success("Correction updated");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (overview.corrections.length === 0) {
    return <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">No user-submitted corrections yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {overview.corrections.map((c) => (
        <li key={c.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            <span className="text-xs font-medium">{c.targetType}{c.targetLabel ? ` · ${c.targetLabel}` : ""}</span>
            {c.field && <Badge variant="secondary" className="text-[10px]">{c.field}: {c.proposedValue}</Badge>}
            <span className="ml-auto text-[11px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug">{c.message}</p>
          {c.submitterEmail && <p className="mt-0.5 text-[11px] text-muted-foreground">by {c.submitterEmail}</p>}
          {c.adminNote && <p className="mt-1 text-[11px] text-muted-foreground">Note: {c.adminNote}</p>}
          {c.status === "open" && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={notes[c.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                placeholder="Reviewer note (optional)"
                className="min-h-[36px] flex-1 text-xs"
                rows={1}
              />
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: c.id, status: "resolved", adminNote: notes[c.id] })}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" /> Resolve
                </Button>
                <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: c.id, status: "rejected", adminNote: notes[c.id] })}>
                  <XCircle className="mr-1 h-3.5 w-3.5 text-red-600" /> Reject
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
