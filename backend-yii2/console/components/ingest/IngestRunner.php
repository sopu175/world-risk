<?php

namespace console\components\ingest;

use Yii;
use api\modules\v1\support\Format;

/**
 * Ingestion orchestrator (console + admin-triggered).
 *
 * Guarantees (identical to the sandbox runner):
 *  - every attempt produces an ingestion_run audit row
 *  - failures are recorded; repeated failures flip the source to
 *    auto_disabled after 5 consecutive failures (admin can re-enable)
 *  - existing valid data is never deleted or overwritten by failed imports
 *  - sources run sequentially; a source never runs concurrently with itself
 */
final class IngestRunner
{
    private const AUTO_DISABLE_THRESHOLD = 5;

    /**
     * Runs the given source keys (or every eligible bulk source) sequentially.
     *
     * @param list<string>|null $sourceKeys
     * @return list<array{sourceKey:string, runId:?int, status:string, reason:?string, recordsFetched?:int, recordsInserted?:int, recordsUpdated?:int, recordsSkipped?:int, recordsInvalid?:int, datasetVersion?:?string, durationMs?:?int}>
     */
    public static function run(?array $sourceKeys, string $trigger): array
    {
        $defs = SourceRegistry::defs();
        $keys = $sourceKeys !== null && $sourceKeys !== []
            ? $sourceKeys
            : array_values(array_filter(array_map(
                static fn (array $d): string => $d['key'],
                array_filter($defs, static fn (array $d): bool => $d['accessMode'] === 'bulk')
            )));

        $outcomes = [];
        foreach ($keys as $key) {
            $outcomes[] = self::runSource((string) $key, $trigger);
        }
        return $outcomes;
    }

    /**
     * Runs a single source end-to-end and records the audit trail.
     *
     * @return array{sourceKey:string, runId:?int, status:string, reason:?string, recordsFetched?:int, recordsInserted?:int, recordsUpdated?:int, recordsSkipped?:int, recordsInvalid?:int, datasetVersion?:?string, durationMs?:?int}
     */
    public static function runSource(string $sourceKey, string $trigger): array
    {
        $def = SourceRegistry::def($sourceKey);
        if ($def === null) {
            return ['sourceKey' => $sourceKey, 'runId' => null, 'status' => 'skipped', 'reason' => 'Unknown source key'];
        }
        if ($def['accessMode'] !== 'bulk' || $def['adapter'] === null) {
            return ['sourceKey' => $sourceKey, 'runId' => null, 'status' => 'skipped', 'reason' => 'On-demand source — nothing to bulk-ingest'];
        }

        $envVar = $def['requiresApiKeyEnv'];
        if ($envVar !== null && trim((string) (getenv((string) $envVar) ?: '')) === '') {
            return ['sourceKey' => $sourceKey, 'runId' => null, 'status' => 'skipped', 'reason' => 'Missing ' . $envVar];
        }

        $source = (new \yii\db\Query())->from('data_source')->where(['key' => $sourceKey])->one();
        if ($source === null) {
            return ['sourceKey' => $sourceKey, 'runId' => null, 'status' => 'skipped', 'reason' => 'Source not seeded — run migrations'];
        }
        if ((bool) $source['enabled'] !== true) {
            return ['sourceKey' => $sourceKey, 'runId' => null, 'status' => 'skipped', 'reason' => 'Disabled by administrator'];
        }
        if (self::hasActiveRun((int) $source['id'])) {
            return ['sourceKey' => $sourceKey, 'runId' => null, 'status' => 'skipped', 'reason' => 'A run for this source is already in progress'];
        }

        $startedAt = microtime(true);
        $runId = self::startRun((int) $source['id'], $trigger, (int) $source['consecutive_failures'] + 1);
        Yii::$app->db->createCommand()->update('data_source', ['last_attempt_at' => Format::nowIso()], ['id' => $source['id']])->execute();

        $logs = [];
        $log = static function (string $msg) use (&$logs): void {
            $logs[] = $msg;
        };

        try {
            /** @var callable $adapterRun */
            $adapter = $def['adapter'];
            $result = $adapter::run((int) $source['id'], $log);

            $touched = $result['recordsInserted'] + $result['recordsUpdated'];
            $status = $result['recordsInvalid'] > 0 && $touched > 0 ? 'partial' : 'success';
            $durationMs = (int) round((microtime(true) - $startedAt) * 1000);

            Yii::$app->db->createCommand()->update('ingestion_run', [
                'status' => $status,
                'records_fetched' => $result['recordsFetched'],
                'records_inserted' => $result['recordsInserted'],
                'records_updated' => $result['recordsUpdated'],
                'records_skipped' => $result['recordsSkipped'],
                'records_invalid' => $result['recordsInvalid'],
                'dataset_version' => $result['datasetVersion'],
                'duration_ms' => $durationMs,
                'finished_at' => Format::nowIso(),
                'error_message' => $logs !== [] ? mb_substr(implode(' | ', array_slice($logs, -3)), 0, 1000) : null,
            ], ['id' => $runId])->execute();

            Yii::$app->db->createCommand()->update('data_source', [
                'last_success_at' => Format::nowIso(),
                'consecutive_failures' => 0,
                'status' => 'active',
                'status_reason' => null,
            ], ['id' => $source['id']])->execute();

            return array_merge(
                ['sourceKey' => $sourceKey, 'runId' => $runId, 'status' => $status, 'reason' => null],
                $result,
                ['durationMs' => $durationMs]
            );
        } catch (\Throwable $e) {
            $failures = (int) $source['consecutive_failures'] + 1;
            $message = mb_substr($e->getMessage(), 0, 1000);
            $autoDisabled = $failures >= self::AUTO_DISABLE_THRESHOLD;
            $durationMs = (int) round((microtime(true) - $startedAt) * 1000);

            Yii::$app->db->createCommand()->update('ingestion_run', [
                'status' => 'failed',
                'error_message' => $message,
                'duration_ms' => $durationMs,
                'finished_at' => Format::nowIso(),
            ], ['id' => $runId])->execute();

            $newStatus = $autoDisabled ? 'auto_disabled' : ((string) $source['status'] === 'needs_config' ? 'needs_config' : 'failed');
            Yii::$app->db->createCommand()->update('data_source', [
                'consecutive_failures' => $failures,
                'last_attempt_at' => Format::nowIso(),
                'status' => $newStatus,
                'status_reason' => $autoDisabled
                    ? sprintf('Auto-disabled after %d consecutive failed imports. Last error: %s', $failures, mb_substr($message, 0, 200))
                    : mb_substr($message, 0, 300),
            ], ['id' => $source['id']])->execute();

            return [
                'sourceKey' => $sourceKey,
                'runId' => $runId,
                'status' => 'failed',
                'reason' => $message,
                'durationMs' => $durationMs,
            ];
        }
    }

    /** Marks the seed status of every registry source (idempotent). */
    public static function seedSources(): void
    {
        foreach (SourceRegistry::defs() as $def) {
            $existing = (new \yii\db\Query())->from('data_source')->where(['key' => $def['key']])->one();

            $envVar = $def['requiresApiKeyEnv'];
            $apiKeyPresent = $envVar !== null && trim((string) (getenv((string) $envVar) ?: '')) !== '';
            $status = 'active';
            $statusReason = null;
            if ($envVar !== null && !$apiKeyPresent) {
                $status = 'needs_config';
                $statusReason = sprintf('Requires the %s environment variable (free registration with the provider).', $envVar);
            } elseif ($def['accessMode'] === 'bulk' && $def['adapter'] === null) {
                $status = 'needs_config';
                $statusReason = 'Ingestion adapter is pending validation — no data is loaded until then.';
            }

            $row = [
                'key' => $def['key'],
                'name' => $def['name'],
                'provider' => $def['provider'],
                'homepage_url' => $def['homepageUrl'],
                'license_name' => $def['licenseName'],
                'license_url' => $def['licenseUrl'],
                'endpoint_url' => $def['endpointUrl'],
                'access_mode' => $def['accessMode'],
                'cadence_hours' => $def['cadenceHours'],
                'requires_api_key_env' => $envVar,
                'api_key_present' => $apiKeyPresent,
                'notes' => $def['notes'],
                'updated_at' => Format::nowIso(),
            ];

            if ($existing === null) {
                $row += [
                    'enabled' => $status !== 'needs_config',
                    'status' => $status,
                    'status_reason' => $statusReason,
                    'created_at' => Format::nowIso(),
                ];
                Yii::$app->db->createCommand()->insert('data_source', $row)->execute();
            } else {
                // never override admin-set states (disabled/auto_disabled/failed)
                $statusStillEnvDriven = in_array((string) $existing['status'], ['active', 'needs_config'], true);
                if ($statusStillEnvDriven) {
                    $row['status'] = $status;
                    $row['status_reason'] = $statusReason;
                    $row['enabled'] = $status !== 'needs_config';
                }
                $row['api_key_present'] = $apiKeyPresent;
                Yii::$app->db->createCommand()->update('data_source', $row, ['key' => $def['key']])->execute();
            }
        }
    }

    /** Bootstraps all eligible bulk sources exactly once (idempotent). */
    public static function bootstrap(): array
    {
        self::seedSources();
        $hasAnyRun = (new \yii\db\Query())->from('ingestion_run')->exists();
        if ($hasAnyRun) {
            return [];
        }
        return self::run(null, 'bootstrap');
    }

    private static function hasActiveRun(int $sourceId): bool
    {
        $recentRunning = (new \yii\db\Query())
            ->from('ingestion_run')
            ->where(['source_id' => $sourceId, 'status' => 'running'])
            ->andWhere(['>=', 'started_at', gmdate('Y-m-d\TH:i:s\Z', time() - 300)])
            ->exists();
        return $recentRunning;
    }

    private static function startRun(int $sourceId, string $trigger, int $attempt): int
    {
        Yii::$app->db->createCommand()->insert('ingestion_run', [
            'source_id' => $sourceId,
            'status' => 'running',
            'trigger' => $trigger,
            'attempt' => $attempt,
            'started_at' => Format::nowIso(),
        ])->execute();
        return (int) Yii::$app->db->getLastInsertID('ingestion_run_id_seq');
    }
}
