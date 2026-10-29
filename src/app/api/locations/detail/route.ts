import { ok, fail, zodFail, readJson } from "@/lib/api-utils";
import { locationDetailBodySchema } from "@/lib/validation";
import { buildLocationDetail } from "@/lib/services/location";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const parsed = locationDetailBodySchema.safeParse(body);
    if (!parsed.success) return zodFail(parsed.error);
    const detail = await buildLocationDetail(parsed.data);
    return ok(detail);
  } catch (err) {
    return fail("location_detail_error", err instanceof Error ? err.message : "Failed to build location detail", 500);
  }
}
