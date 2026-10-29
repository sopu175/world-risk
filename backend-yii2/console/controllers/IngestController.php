<?php

namespace console\controllers;

use Yii;
use yii\console\Controller;
use yii\console\ExitCode;
use console\components\ingest\IngestRunner;

/**
 * Ingestion commands:
 *
 *   php yii ingest/bootstrap         — seed registry + first import (idempotent)
 *   php yii ingest/run               — import every eligible bulk source
 *   php yii ingest/run usgs-earthquakes nasa-eonet   — specific sources only
 *
 * Production scheduling (cron):
 *   0 * * * * php /var/www/worldrisk-atlas/yii ingest/run >> runtime/ingest.log 2>&1
 */
final class IngestController extends Controller
{
    public $defaultAction = 'run';

    /**
     * Runs ingestion for all eligible bulk sources (or the given keys).
     */
    public function actionRun(array $sourceKeys = []): int
    {
        IngestRunner::seedSources();
        $outcomes = IngestRunner::run($sourceKeys === [] ? null : $sourceKeys, 'scheduled');

        $failed = 0;
        foreach ($outcomes as $o) {
            $line = sprintf(
                '[%s] %s%s',
                $o['status'],
                $o['sourceKey'],
                $o['reason'] !== null ? ' — ' . $o['reason'] : ''
            );
            if ($o['status'] === 'success' || $o['status'] === 'partial') {
                $line .= sprintf(
                    ' fetched=%d inserted=%d updated=%d skipped=%d invalid=%d (%d ms)',
                    $o['recordsFetched'] ?? 0,
                    $o['recordsInserted'] ?? 0,
                    $o['recordsUpdated'] ?? 0,
                    $o['recordsSkipped'] ?? 0,
                    $o['recordsInvalid'] ?? 0,
                    $o['durationMs'] ?? 0
                );
            }
            $this->stdout($line . PHP_EOL);
            if ($o['status'] === 'failed') {
                $failed++;
            }
        }

        return $failed > 0 ? ExitCode::UNSPECIFIED_ERROR : ExitCode::OK;
    }

    /**
     * First-run bootstrap: seeds the registries and, if no ingestion has ever
     * run, performs the initial import. Safe to call repeatedly.
     */
    public function actionBootstrap(): int
    {
        $outcomes = IngestRunner::bootstrap();
        if ($outcomes === []) {
            $this->stdout('Nothing to bootstrap — ingestion has run before.' . PHP_EOL);
            return ExitCode::OK;
        }
        foreach ($outcomes as $o) {
            $this->stdout(sprintf('[%s] %s%s' . PHP_EOL, $o['status'], $o['sourceKey'], $o['reason'] !== null ? ' — ' . $o['reason'] : ''));
        }
        return ExitCode::OK;
    }
}
