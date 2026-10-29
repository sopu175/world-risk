// Idempotent seeding + first-run bootstrap.
//
// ensureSeed()          — registry rows (data sources, hazard layers) synced
//                         from static definitions; safe to call on every
//                         request; never clobbers admin-set disabled states.
// ensureBootstrapped()  — after a fresh deploy, performs the first import for
//                         every eligible bulk source exactly once.

import { db } from "@/lib/db";
import { SOURCE_DEFS } from "@/lib/ingest/sources";
import { LAYER_DEFS } from "@/lib/hazard-meta";
import { computeSeedStatus, runIngestion } from "@/lib/ingest/runner";

let seedPromise: Promise<void> | null = null;

export async function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function doSeed(): Promise<void> {
  for (const def of SOURCE_DEFS) {
    const { status, statusReason, apiKeyPresent } = computeSeedStatus(def);
    const existing = await db.dataSource.findUnique({ where: { key: def.key } });

    if (!existing) {
      await db.dataSource.create({
        data: {
          key: def.key,
          name: def.name,
          provider: def.provider,
          homepageUrl: def.homepageUrl,
          licenseName: def.licenseName,
          licenseUrl: def.licenseUrl,
          endpointUrl: def.endpointUrl,
          accessMode: def.accessMode,
          cadenceHours: def.cadenceHours,
          requiresApiKeyEnv: def.requiresApiKeyEnv,
          apiKeyPresent,
          enabled: status !== "needs_config",
          status,
          statusReason,
          notes: def.notes,
        },
      });
    } else {
      // Sync metadata + env-derived status, but never override admin actions
      // (disabled / auto_disabled / failed are preserved until changed).
      const statusStillEnvDriven =
        existing.status === "active" || existing.status === "needs_config";
      await db.dataSource.update({
        where: { key: def.key },
        data: {
          name: def.name,
          provider: def.provider,
          homepageUrl: def.homepageUrl,
          licenseName: def.licenseName,
          licenseUrl: def.licenseUrl,
          endpointUrl: def.endpointUrl,
          accessMode: def.accessMode,
          cadenceHours: def.cadenceHours,
          requiresApiKeyEnv: def.requiresApiKeyEnv,
          apiKeyPresent,
          notes: def.notes,
          ...(statusStillEnvDriven ? { status, statusReason, enabled: status !== "needs_config" } : {}),
        },
      });
    }
  }

  for (const def of LAYER_DEFS) {
    await db.hazardLayer.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        name: def.name,
        hazardType: def.hazardType,
        kind: def.kind,
        description: def.description,
        units: def.units,
        methodology: def.methodology,
        resolution: def.resolution,
        temporalCoverage: def.temporalCoverage,
        licenseName: def.licenseName,
        licenseUrl: def.licenseUrl,
        limitations: def.limitations,
        sourceKey: def.sourceKey,
        colorHex: def.colorHex,
        mapAvailable: def.mapAvailable,
        available: false,
        sortOrder: def.sortOrder,
      },
      update: {
        name: def.name,
        description: def.description,
        units: def.units,
        methodology: def.methodology,
        resolution: def.resolution,
        temporalCoverage: def.temporalCoverage,
        licenseName: def.licenseName,
        licenseUrl: def.licenseUrl,
        limitations: def.limitations,
        sourceKey: def.sourceKey,
        colorHex: def.colorHex,
        mapAvailable: def.mapAvailable,
        sortOrder: def.sortOrder,
      },
    });
  }
}

let bootstrapPromise: Promise<void> | null = null;

/**
 * Fire-and-forget first import. Resolves when the initial ingestion of all
 * eligible bulk sources has completed (or already ran at any point before).
 */
export function ensureBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = doBootstrap().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

async function doBootstrap(): Promise<void> {
  await ensureSeed();
  const runCount = await db.ingestionRun.count();
  if (runCount > 0) return; // already bootstrapped at some point — never re-run silently
  await runIngestion(undefined, "bootstrap");
}
