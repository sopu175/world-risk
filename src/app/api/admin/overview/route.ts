import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-utils";
import { ensureSeed } from "@/lib/ingest/bootstrap";
import { checkAdminAuth } from "@/lib/env";
import type { AdminOverviewDTO, CorrectionDTO, DataSourceDTO, IngestionRunDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) return fail("unauthorized", auth.reason ?? "Unauthorized", 401);

  try {
    await ensureSeed();

    const [sources, runs, corrections, obsTotal, eventTotal, obsByLayer, eventsByType] = await Promise.all([
      db.dataSource.findMany({ orderBy: [{ accessMode: "asc" }, { key: "asc" }] }),
      db.ingestionRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 60,
        include: { source: { select: { key: true, name: true } } },
      }),
      db.correction.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      db.hazardObservation.count(),
      db.disasterEvent.count(),
      db.hazardObservation.groupBy({ by: ["layerId"], _count: { _all: true }, _max: { occurredAt: true } }),
      db.disasterEvent.groupBy({ by: ["eventType"], _count: { _all: true }, _max: { startDate: true } }),
    ]);

    const layers = await db.hazardLayer.findMany();
    const layerById = new Map(layers.map((l) => [l.id, l]));

    const sourceDTOs: DataSourceDTO[] = sources.map((s) => {
      const obsCount = s.accessMode === "bulk" && s.key === "usgs-earthquakes"
        ? obsByLayer.filter((o) => layerById.get(o.layerId)?.hazardType === "earthquake").reduce((sum, o) => sum + o._count._all, 0)
        : 0;
      return {
        key: s.key,
        name: s.name,
        provider: s.provider,
        homepageUrl: s.homepageUrl,
        licenseName: s.licenseName,
        licenseUrl: s.licenseUrl,
        endpointUrl: s.endpointUrl,
        accessMode: s.accessMode,
        cadenceHours: s.cadenceHours,
        requiresApiKeyEnv: s.requiresApiKeyEnv,
        apiKeyPresent: s.apiKeyPresent,
        enabled: s.enabled,
        status: s.status,
        statusReason: s.statusReason,
        lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
        lastAttemptAt: s.lastAttemptAt?.toISOString() ?? null,
        consecutiveFailures: s.consecutiveFailures,
        notes: s.notes,
        observationCount: obsCount,
        eventCount: s.key === "usgs-earthquakes" ? 0 : eventTotal,
      };
    });

    const runDTOs: IngestionRunDTO[] = runs.map((r) => ({
      id: r.id,
      sourceKey: r.source.key,
      sourceName: r.source.name,
      status: r.status,
      trigger: r.trigger,
      attempt: r.attempt,
      recordsFetched: r.recordsFetched,
      recordsInserted: r.recordsInserted,
      recordsUpdated: r.recordsUpdated,
      recordsSkipped: r.recordsSkipped,
      recordsInvalid: r.recordsInvalid,
      datasetVersion: r.datasetVersion,
      errorMessage: r.errorMessage,
      durationMs: r.durationMs,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    }));

    const correctionDTOs: CorrectionDTO[] = corrections.map((c) => ({
      id: c.id,
      targetType: c.targetType,
      targetId: c.targetId,
      targetLabel: c.targetLabel,
      field: c.field,
      proposedValue: c.proposedValue,
      message: c.message,
      submitterEmail: c.submitterEmail,
      status: c.status,
      adminNote: c.adminNote,
      createdAt: c.createdAt.toISOString(),
      resolvedAt: c.resolvedAt?.toISOString() ?? null,
    }));

    const dto: AdminOverviewDTO = {
      stats: {
        observations: obsTotal,
        events: eventTotal,
        openCorrections: correctionDTOs.filter((c) => c.status === "open").length,
        totalCorrections: correctionDTOs.length,
        sourcesActive: sourceDTOs.filter((s) => s.accessMode === "bulk" && s.status === "active").length,
        sourcesNeedsConfig: sourceDTOs.filter((s) => s.status === "needs_config").length,
      },
      sources: sourceDTOs,
      runs: runDTOs,
      coverage: {
        byLayer: layers.map((l) => {
          if (l.hazardType === "earthquake") {
            const agg = obsByLayer.find((o) => o.layerId === l.id);
            return { layerKey: l.key, count: agg?._count._all ?? 0, lastAt: agg?._max.occurredAt?.toISOString() ?? null };
          }
          const agg = eventsByType.find((e) => e.eventType === l.hazardType);
          return { layerKey: l.key, count: agg?._count._all ?? 0, lastAt: agg?._max.startDate?.toISOString() ?? null };
        }),
        eventsByType: eventsByType
          .map((g) => ({ eventType: g.eventType, count: g._count._all, lastAt: g._max.startDate?.toISOString() ?? null }))
          .sort((a, b) => b.count - a.count),
      },
      corrections: correctionDTOs,
      adminAuthMode: process.env.ADMIN_TOKEN ? "token" : "open",
    };

    return ok(dto);
  } catch (err) {
    return fail("admin_overview_error", err instanceof Error ? err.message : "Failed to load admin overview", 500);
  }
}
