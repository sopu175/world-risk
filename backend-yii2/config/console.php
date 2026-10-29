<?php
/**
 * WorldRisk Atlas — console application configuration.
 *
 * Used for database migrations (`php yii migrate`) and ingestion
 * (`php yii ingest/bootstrap`, `php yii ingest/run [sourceKey...]` — wire the
 * latter into cron per the cadences in the data_source registry).
 */

$common = require __DIR__ . '/common.php';

$common['id'] = 'worldrisk-atlas-console';
$common['bootstrap'] = ['log'];

$common['controllerNamespace'] = 'console\controllers';

// Keep runtime noise low in cron contexts; errors/warnings still go to
// runtime/logs/app.log via the shared log component.
$common['components']['log']['targets'][] = [
    'class' => 'yii\log\FileTarget',
    'categories' => ['console\*'],
    'levels' => ['info'],
    'logFile' => '@runtime/logs/console.log',
];

return $common;
