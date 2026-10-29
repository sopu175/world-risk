// Centralised environment configuration.
// Every optional integration degrades to an explicit "needs_config" state —
// the platform never fabricates data for unconfigured sources.

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export const env = {
  /** Optional admin token. When unset, admin endpoints are open with a visible dev warning. */
  adminToken: readEnv("ADMIN_TOKEN"),
  /** ReliefWeb requires a registered, approved appname (https://apidoc.reliefweb.int). */
  reliefwebAppname: readEnv("RELIEFWEB_APPNAME"),
  /** NASA FIRMS free MAP_KEY (https://firms.modaps.eosdis.nasa.gov/api/map_key/). */
  firmsMapKey: readEnv("FIRMS_MAP_KEY"),
  /** Identifies the platform to upstream APIs. */
  userAgent: readEnv("APP_USER_AGENT") ?? "WorldRiskAtlas/0.1 (open data atlas; contact: ops@worldriskatlas.example)",
} as const;

export function hasAdminToken(): boolean {
  return Boolean(env.adminToken);
}

export function checkAdminAuth(req: Request): { ok: boolean; reason?: string } {
  if (!env.adminToken) return { ok: true }; // dev mode — UI shows a warning banner
  const header = req.headers.get("x-admin-token");
  return header === env.adminToken
    ? { ok: true }
    : { ok: false, reason: "Missing or invalid x-admin-token header" };
}
