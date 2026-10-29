import { ok, fail, zodFail } from "@/lib/api-utils";
import { locationSearchQuerySchema } from "@/lib/validation";
import { searchLocations } from "@/lib/services/location";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = locationSearchQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      count: url.searchParams.get("count") ?? undefined,
    });
    if (!q.success) return zodFail(q.error);
    const results = await searchLocations(q.data.q, q.data.count);
    return ok({
      results,
      attribution: "Geocoding by Open-Meteo / GeoNames (CC-BY 4.0)",
    });
  } catch (err) {
    return fail("search_error", err instanceof Error ? err.message : "Location search failed", 502);
  }
}
