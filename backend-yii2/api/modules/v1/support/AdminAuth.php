<?php

namespace api\modules\v1\support;

use Yii;
use yii\base\ActionFilter;

/**
 * x-admin-token filter for /v1/admin/* endpoints.
 *
 *  - When the ADMIN_TOKEN environment variable is set (non-blank), every
 *    request must carry a matching `x-admin-token` header (constant-time
 *    comparison). Otherwise the filter responds 401 and stops the action.
 *  - When ADMIN_TOKEN is unset, the filter runs in OPEN mode and allows all
 *    requests (development convenience; the admin UI shows a visible warning).
 *
 * Attached as a controller behavior on AdminController only.
 */
final class AdminAuth extends ActionFilter
{
    public function beforeAction($action)
    {
        if (!self::check()) {
            ApiResponse::fail('unauthorized', 'Missing or invalid x-admin-token header', 401);
            return false;
        }
        return parent::beforeAction($action);
    }

    public static function check(): bool
    {
        $token = self::configuredToken();
        if ($token === '') {
            return true; // open mode
        }
        $header = Yii::$app->request->headers->get('x-admin-token');
        if (!is_string($header) || $header === '') {
            return false;
        }
        return hash_equals($token, $header);
    }

    /**
     * @return string 'token' | 'open'
     */
    public static function mode(): string
    {
        return self::configuredToken() !== '' ? 'token' : 'open';
    }

    private static function configuredToken(): string
    {
        $token = getenv('ADMIN_TOKEN');
        if ($token === false) {
            return '';
        }
        return trim($token);
    }
}
