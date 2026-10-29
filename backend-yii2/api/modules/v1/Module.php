<?php

namespace api\modules\v1;

use Yii;
use yii\base\Module as BaseModule;
use yii\web\Response;

/**
 * The v1 REST API module.
 *
 * All endpoints are explicit URL rules (see config/web.php). CORS and JSON
 * content negotiation are attached per-controller via
 * api\modules\v1\controllers\BaseController::behaviors().
 */
final class Module extends BaseModule
{
    public $controllerNamespace = 'api\modules\v1\controllers';

    public function init()
    {
        parent::init();
        // Pure API — always JSON, even for framework-generated error bodies.
        Yii::$app->response->format = Response::FORMAT_JSON;
    }
}
