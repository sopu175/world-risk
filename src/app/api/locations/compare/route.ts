import { ok, fail, zodFail, readJson } from "@/lib/api-utils";
import { z } from "zod";
import { buildLocationCompare } from "@/lib/services/location";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const compareBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const parsed = compareBodySchema.safeParse(body);
    if (!parsed.success) return zodFail(parsed.error);
    const rows = await buildLocationCompare(parsed.data);
    return ok({ rows });
  } catch (err) {
    return fail("compare_error", err instanceof Error ? err.message : "Failed to compare locations", 500);
  }
}
