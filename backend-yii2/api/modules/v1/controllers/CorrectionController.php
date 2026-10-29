<?php

namespace api\modules\v1\controllers;

use Yii;
use common\models\Correction;
use api\modules\v1\support\ApiResponse;
use api\modules\v1\support\Dto;

/**
 * POST /v1/corrections — user-submitted data corrections.
 */
final class CorrectionController extends BaseController
{
    public function actionIndex()
    {
        if (Yii::$app->request->method !== 'POST') {
            return ApiResponse::fail('method_not_allowed', 'Use POST /v1/corrections', 405);
        }

        [$body, $err] = $this->readBody([
            'targetType' => 'enum:event|observation|location:required',
            'targetId' => 'string',
            'targetLabel' => 'string',
            'field' => 'string',
            'proposedValue' => 'string',
            'message' => 'string:required',
            'submitterEmail' => 'string',
        ]);
        if ($err !== null) {
            return $err;
        }

        $message = (string) $body['message'];
        if (mb_strlen($message) < 10 || mb_strlen($message) > 2000) {
            return ApiResponse::fail('validation_error', 'message must be 10–2000 characters', 400);
        }
        $email = isset($body['submitterEmail']) && $body['submitterEmail'] !== '' ? (string) $body['submitterEmail'] : null;
        if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ApiResponse::fail('validation_error', 'submitterEmail is not a valid email address', 400);
        }

        $correction = new Correction();
        $correction->target_type = (string) $body['targetType'];
        $correction->target_id = isset($body['targetId']) ? mb_substr((string) $body['targetId'], 0, 64) : null;
        $correction->target_label = isset($body['targetLabel']) ? mb_substr((string) $body['targetLabel'], 0, 160) : null;
        $correction->field = isset($body['field']) ? mb_substr((string) $body['field'], 0, 60) : null;
        $correction->proposed_value = isset($body['proposedValue']) ? mb_substr((string) $body['proposedValue'], 0, 500) : null;
        $correction->message = $message;
        $correction->submitter_email = $email !== null ? mb_substr($email, 0, 160) : null;
        $correction->status = 'open';

        if (!$correction->save(true)) {
            return ApiResponse::fail('validation_error', implode('; ', $correction->getFirstErrors()), 400);
        }

        Yii::$app->response->statusCode = 201;
        return ApiResponse::ok([
            'id' => (string) $correction->id,
            'status' => $correction->status,
            'createdAt' => \api\modules\v1\support\Format::isoFromDateTime($correction->created_at),
            'message' => 'Correction submitted — it will be reviewed by a data steward.',
        ]);
    }
}
