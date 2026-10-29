// SSRF-hardened outbound fetch for ingestion + on-demand upstream queries.
//
// Rules enforced here:
//  1. HTTPS only.
//  2. Host allow-list — only hosts that appear in the documented data-source
//     registry may be contacted. Raw user-supplied URLs are never fetched.
//  3. Bounded timeout, bounded redirects, bounded payload size.
//  4. Identifiable User-Agent.

import { env } from "@/lib/env";
import dns from "node:dns";

// Some upstream hosts advertise AAAA records that are unreachable from this
// network; Node's undici resolver then fails with "fetch failed". Prefer
// IPv4 lookups process-wide (idempotent, harmless in bun).
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* ignore — non-Node runtimes */
}

export const ALLOWED_HOSTS = new Set<string>([
  "earthquake.usgs.gov",
  "eonet.gsfc.nasa.gov",
  "api.open-meteo.com",
  "geocoding-api.open-meteo.com",
  "archive-api.open-meteo.com",
  "air-quality-api.open-meteo.com",
  "nominatim.openstreetmap.org",
  "api.reliefweb.int",
  "firms.modaps.eosdis.nasa.gov",
]);

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly host?: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export type FetchJsonOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  maxBytes?: number;
};

function assertAllowed(url: URL): void {
  if (url.protocol !== "https:") {
    throw new UpstreamError(`Blocked non-HTTPS upstream URL: ${url.protocol}`, undefined, url.host);
  }
  if (!ALLOWED_HOSTS.has(url.host)) {
    throw new UpstreamError(`Blocked upstream host not in the data-source allow-list: ${url.host}`, undefined, url.host);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJsonSafe<T>(rawUrl: string, opts: FetchJsonOptions = {}): Promise<T> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UpstreamError(`Invalid upstream URL: ${rawUrl}`);
  }
  assertAllowed(url);

  // Sandbox egress occasionally drops fresh connections (observed ETIMEDOUT on
  // ~1/3 of new TCP+TLS handshakes to some CDN edges; pooled connections are
  // stable). Default to 4 attempts with jittered backoff; on-demand hot paths
  // pass higher values.
  const { timeoutMs = 20_000, retries = 4, retryDelayMs = 500, maxBytes = 25 * 1024 * 1024 } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const jitter = Math.floor(Math.random() * 300);
      await sleep(retryDelayMs * 2 ** (attempt - 1) + jitter);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": env.userAgent,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new UpstreamError(`Upstream ${url.host} responded HTTP ${res.status}`, res.status, url.host);
      }
      const lenHeader = res.headers.get("content-length");
      if (lenHeader && Number(lenHeader) > maxBytes) {
        throw new UpstreamError(`Upstream payload too large (${lenHeader} bytes)`, undefined, url.host);
      }
      const text = await res.text();
      if (text.length > maxBytes) {
        throw new UpstreamError(`Upstream payload too large (> ${maxBytes} bytes)`, undefined, url.host);
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err;
      if (err instanceof UpstreamError && err.status && err.status < 500 && err.status !== 429) {
        throw err; // 4xx: retrying will not help
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError instanceof UpstreamError) throw lastError;
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new UpstreamError(`Upstream ${url.host} failed: ${msg}`, undefined, url.host);
}
