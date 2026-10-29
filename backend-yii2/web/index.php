<?php
/**
 * WorldRisk Atlas — web entry point.
 *
 * Production: point nginx/Apache docroot at backend-yii2/web and route all
 * requests through this file. For local development: `composer serve`
 * (which runs `php yii serve`, serving @app/web by default).
 */

require __DIR__ . '/../common/bootstrap.php';

defined('YII_DEBUG') || define('YII_DEBUG', wra_env('YII_DEBUG', '0') === '1');
defined('YII_ENV') || define('YII_ENV', wra_env('YII_ENV', 'prod'));

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../vendor/yiisoft/yii2/Yii.php';

$config = require __DIR__ . '/../config/web.php';

(new yii\web\Application($config))->run();
