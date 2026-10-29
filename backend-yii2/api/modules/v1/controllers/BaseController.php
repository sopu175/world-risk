<?php

namespace api\modules\v1\controllers;

use Yii;
use yii\web\Controller;
use api\modules\v1\support\ApiResponse;

/**
 * Shared controller base for the v1 API: JSON error mapping and input
 * helpers. Actions return ApiResponse responses; unexpected throwables are
 * converted to the standard error envelope by handleError().
 */
abstract class BaseController extends Controller
{
    /** Disable CSRF (stateless JSON API; cookie validation is off). */
    public $enableCsrfValidation = false;

    public function beforeAction($action)
    {
        // Keep raw JSON bodies accessible via request->bodyParams (JsonParser).
        return parent::beforeAction($action);
    }

    /**
     * Reads and validates a JSON body field against a small rule spec:
     * ['latitude' => 'number:required', 'name' => 'string:optional', ...].
     * Returns [data, null] or [null, Response] on failure.
     *
     * @return array{0: array|null, 1: \yii\web\Response|null}
     */
    protected function readBody(array $spec): array
    {
        $body = Yii::$app->request->bodyParams;
        if (!is_array($body)) {
            $body = [];
        }
        $out = [];
        foreach ($spec as $field => $rule) {
            $parts = explode(':', $rule);
            $type = $parts[0];
            $required = in_array('required', $parts, true);
            $has = array_key_exists($field, $body) && $body[$field] !== null;
            if (!$has) {
                if ($required) {
                    return [null, ApiResponse::fail('validation_error', "Missing required field: {$field}", 400)];
                }
                continue;
            }
            $value = $body[$field];
            switch ($type) {
                case 'number':
                    if (!is_int($value) && !is_float($value) && !is_numeric($value)) {
                        return [null, ApiResponse::fail('validation_error', "Field {$field} must be a number", 400)];
                    }
                    $out[$field] = (float) $value;
                    break;
                case 'bool':
                    if (!is_bool($value)) {
                        return [null, ApiResponse::fail('validation_error', "Field {$field} must be a boolean", 400)];
                    }
                    $out[$field] = $value;
                    break;
                case 'string':
                    if (!is_string($value)) {
                        return [null, ApiResponse::fail('validation_error', "Field {$field} must be a string", 400)];
                    }
                    $out[$field] = trim($value);
                    break;
                case 'enum':
                    $allowed = explode('|', (string) $parts[1]);
                    if (!in_array((string) $value, $allowed, true)) {
                        return [null, ApiResponse::fail('validation_error', "Field {$field} must be one of: " . implode(', ', $allowed), 400)];
                    }
                    $out[$field] = (string) $value;
                    break;
                default:
                    $out[$field] = $value;
            }
        }
        return [$out, null];
    }

    /**
     * @param string|int $code
     */
    protected function numericQuery(string $name, $default, float $min, float $max): float
    {
        $raw = Yii::$app->request->getQueryParam($name, $default);
        if (!is_numeric($raw)) {
            return $default;
        }
        $v = (float) $raw;
        return max($min, min($max, $v));
    }

    protected function stringQuery(string $name, ?string $default = null, int $maxLen = 200): ?string
    {
        $raw = Yii::$app->request->getQueryParam($name, $default);
        if (!is_string($raw) || $raw === '') {
            return $default;
        }
        return mb_substr(trim($raw), 0, $maxLen);
    }
}
