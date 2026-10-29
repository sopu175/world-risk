<?php

namespace api\modules\v1\support;

use Yii;
use yii\web\Response;

/**
 * Envelope helper for the REST contract:
 *   success → { data: <payload> }                 (HTTP 2xx)
 *   failure → { error: { code, message } }        (HTTP 4xx/5xx)
 *
 * Every controller action returns the framework response object produced by
 * these helpers; no default model serialization is ever relied upon.
 */
final class ApiResponse
{
    /**
     * @param mixed $data
     */
    public static function ok($data, int $status = 200): Response
    {
        $response = Yii::$app->response;
        $response->format = Response::FORMAT_JSON;
        $response->statusCode = $status;
        $response->data = ['data' => $data];
        return $response;
    }

    public static function fail(string $code, string $message, int $status = 400): Response
    {
        $response = Yii::$app->response;
        $response->format = Response::FORMAT_JSON;
        $response->statusCode = $status;
        $response->data = ['error' => ['code' => $code, 'message' => $message]];
        return $response;
    }
}
