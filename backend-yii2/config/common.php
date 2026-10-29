<?php
/**
 * WorldRisk Atlas — configuration shared by the web and console applications.
 *
 * common/bootstrap.php must have been required before this file loads
 * (both entry scripts do this), so wra_env() is available here.
 */

return [
    'id' => 'worldrisk-atlas',
    'name' => 'WorldRisk Atlas',
    'version' => '0.1.0',

    'basePath' => dirname(__DIR__),
    'vendorPath' => dirname(__DIR__) . '/vendor',
    'runtimePath' => dirname(__DIR__) . '/runtime',

    'timeZone' => 'UTC',
    'language' => 'en-US',
    'sourceLanguage' => 'en-US',

    'aliases' => [
        '@backend' => dirname(__DIR__),
        '@common' => dirname(__DIR__) . '/common',
        '@api' => dirname(__DIR__) . '/api',
        '@console' => dirname(__DIR__) . '/console',
    ],

    'components' => [
        'db' => [
            'class' => 'yii\db\Connection',
            'dsn' => wra_env('DATABASE_DSN', 'pgsql:host=127.0.0.1;port=5432;dbname=worldrisk_atlas'),
            'username' => wra_env('DATABASE_USER'),
            'password' => wra_env('DATABASE_PASSWORD'),
            'charset' => 'utf8',
            // Schema caching is safe in production; per-process array cache
            // means it also works with zero extra infrastructure.
            'enableSchemaCache' => true,
            'schemaCacheDuration' => 3600,
            'schemaCache' => 'cache',
            // Pin the session timezone to UTC so timestamptz values returned
            // by PostgreSQL always carry a +00 offset and round-trip as
            // UTC ISO-8601 strings regardless of server configuration.
            'on afterOpen' => static function ($event) {
                try {
                    $event->sender->createCommand("SET TIME ZONE 'UTC'")->execute();
                } catch (\Throwable $e) {
                    // Non-PostgreSQL drivers (or restricted sessions) — ignore.
                }
            },
        ],

        'cache' => [
            'class' => 'yii\caching\ArrayCache',
        ],

        'log' => [
            'traceLevel' => ((int) wra_env('YII_DEBUG', '0')) !== 0 ? 3 : 0,
            'targets' => [
                [
                    'class' => 'yii\log\FileTarget',
                    'levels' => ['error', 'warning'],
                    'logFile' => '@runtime/logs/app.log',
                ],
            ],
        ],

        'formatter' => [
            'class' => 'yii\i18n\Formatter',
            'timeZone' => 'UTC',
        ],
    ],

    'params' => require __DIR__ . '/params.php',
];
