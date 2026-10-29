<?php
/**
 * WorldRisk Atlas — web (REST API) application configuration.
 *
 * A pure JSON API: no views, no sessions, no cookies. All responses use the
 * envelope { data: ... } on success and { error: { code, message } } on
 * failure (see api/modules/v1/support/ApiResponse.php).
 */

$common = require __DIR__ . '/common.php';

$common['id'] = 'worldrisk-atlas-api';
$common['bootstrap'] = ['log'];

$common['components'] = array_merge($common['components'], [

    'request' => [
        'class' => 'yii\web\Request',
        'enableCookieValidation' => false,
        'enableCsrfValidation' => false,
        // JSON request bodies ({latitude, longitude, ...}) are parsed into
        // body params for POST/PATCH/DELETE handlers.
        'parsers' => [
            'application/json' => 'yii\web\JsonParser',
        ],
    ],

    'response' => [
        'class' => 'yii\web\Response',
        'format' => 'json',
        'charset' => 'UTF-8',
        'formatters' => [
            'json' => [
                'class' => 'yii\web\JsonResponseFormatter',
                'prettyPrint' => false,
                // Unescaped unicode (µg/m³, —, ≥) and slashes for stable output.
                'encodeOptions' => JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
            ],
        ],
    ],

    'urlManager' => [
        'class' => 'yii\web\UrlManager',
        'enablePrettyUrl' => true,
        'enableStrictParsing' => false,
        'showScriptName' => false,
        // Exact route surface — no pluralization helpers, the paths below ARE
        // the contract. Order matters: /v1/events/summary must be matched
        // before /v1/events.
        'rules' => [
            ['pattern' => 'v1/layers', 'route' => 'v1/layer/index'],
            ['pattern' => 'v1/observations', 'route' => 'v1/observation/index'],
            ['pattern' => 'v1/events/summary', 'route' => 'v1/event/summary'],
            ['pattern' => 'v1/events', 'route' => 'v1/event/index'],
            ['pattern' => 'v1/locations/search', 'route' => 'v1/location/search'],
            ['pattern' => 'v1/locations/detail', 'route' => 'v1/location/detail'],
            ['pattern' => 'v1/locations/compare', 'route' => 'v1/location/compare'],
            ['pattern' => 'v1/corrections', 'route' => 'v1/correction/index'],
            ['pattern' => 'v1/saved-locations', 'route' => 'v1/saved-location/index'],
            ['pattern' => 'v1/admin/overview', 'route' => 'v1/admin/overview'],
            ['pattern' => 'v1/admin/sources', 'route' => 'v1/admin/sources'],
            ['pattern' => 'v1/admin/ingest', 'route' => 'v1/admin/ingest'],
            ['pattern' => 'v1/admin/runs', 'route' => 'v1/admin/runs'],
            ['pattern' => 'v1/admin/corrections', 'route' => 'v1/admin/corrections'],
        ],
    ],

    // Stateless API — never start a session.
    'user' => [
        'class' => 'yii\web\User',
        'enableSession' => false,
        'loginUrl' => null,
    ],

    'errorHandler' => [
        'class' => 'yii\web\ErrorHandler',
        'discardExistingOutput' => true,
    ],
]);

$common['modules'] = [
    'v1' => [
        'class' => 'api\modules\v1\Module',
    ],
];

return $common;
