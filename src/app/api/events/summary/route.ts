import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-utils";
import type { EventsSummaryDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const byType = await db.disasterEvent.groupBy({
      by: ["eventType"],
      _count: { _all: true },
      _max: { startDate: true },
    });

    const activeByType = await db.disasterEvent.groupBy({
      by: ["eventType"],
      where: { kind: "active" },
      _count: { _all: true },
    });
    const activeMap = new Map(activeByType.map((g) => [g.eventType, g._count._all]));

    const range = await db.disasterEvent.aggregate({
      _min: { startDate: true },
      _max: { startDate: true },
      _count: { _all: true },
    });

    const dto: EventsSummaryDTO = {
      total: range._count._all,
      activeCount: [...activeMap.values()].reduce((s, v) => s + v, 0),
      byType: byType
        .map((g) => ({
          eventType: g.eventType,
          count: g._count._all,
          activeCount: activeMap.get(g.eventType) ?? 0,
          lastAt: g._max.startDate?.toISOString() ?? null,
        }))
        .sort((a, b) => b.count - a.count),
      coverageStart: range._min.startDate?.toISOString() ?? null,
      coverageEnd: range._max.startDate?.toISOString() ?? null,
    };

    return ok(dto);
  } catch (err) {
    return fail("events_summary_error", err instanceof Error ? err.message : "Failed to load event summary", 500);
  }
}
