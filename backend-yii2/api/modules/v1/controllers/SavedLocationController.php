<?php

namespace api\modules\v1\controllers;

use Yii;
use common\models\SavedLocation;
use api\modules\v1\support\ApiResponse;
use api\modules\v1\support\Dto;

/**
 * /v1/saved-locations — anonymous-session scope in the free tier MVP.
 * Premium tiers will attach these to user accounts and add alert
 * subscriptions (monetization-ready extension point).
 *
 * GET    ?sessionId=...
 * POST   {sessionId, label, latitude, longitude, countryName?, note?}
 * DELETE ?id=...&sessionId=...
 */
final class SavedLocationController extends BaseController
{
    public function actionIndex()
    {
        $method = Yii::$app->request->method;
        switch ($method) {
            case 'GET':
                return $this->doList();
            case 'POST':
                return $this->doCreate();
            case 'DELETE':
                return $this->doDelete();
            default:
                return ApiResponse::fail('method_not_allowed', 'Unsupported method', 405);
        }
    }

    private function doList()
    {
        $sessionId = $this->stringQuery('sessionId', null, 64);
        if ($sessionId === null || strlen($sessionId) < 8) {
            return ApiResponse::fail('validation_error', 'sessionId required (min 8 chars)', 400);
        }
        $rows = SavedLocation::find()
            ->where(['session_id' => $sessionId])
            ->orderBy(['created_at' => SORT_DESC])
            ->limit(50)
            ->asArray()
            ->all();
        return ApiResponse::ok(['savedLocations' => array_map([Dto::class, 'savedLocation'], $rows)]);
    }

    private function doCreate()
    {
        [$body, $err] = $this->readBody([
            'sessionId' => 'string:required',
            'label' => 'string:required',
            'latitude' => 'number:required',
            'longitude' => 'number:required',
            'countryName' => 'string',
            'note' => 'string',
        ]);
        if ($err !== null) {
            return $err;
        }
        if (strlen((string) $body['sessionId']) < 8) {
            return ApiResponse::fail('validation_error', 'sessionId too short', 400);
        }
        if ($body['latitude'] < -90 || $body['latitude'] > 90 || $body['longitude'] < -180 || $body['longitude'] > 180) {
            return ApiResponse::fail('validation_error', 'coordinates out of range', 400);
        }

        $saved = new SavedLocation();
        $saved->session_id = (string) $body['sessionId'];
        $saved->label = mb_substr((string) $body['label'], 0, 120);
        $saved->latitude = (float) $body['latitude'];
        $saved->longitude = (float) $body['longitude'];
        $saved->country_name = isset($body['countryName']) ? mb_substr((string) $body['countryName'], 0, 80) : null;
        $saved->note = isset($body['note']) ? mb_substr((string) $body['note'], 0, 300) : null;

        if (!$saved->save(true)) {
            return ApiResponse::fail('validation_error', implode('; ', $saved->getFirstErrors()), 400);
        }

        Yii::$app->response->statusCode = 201;
        return ApiResponse::ok(['savedLocation' => Dto::savedLocation($saved->toArray())]);
    }

    private function doDelete()
    {
        $id = $this->stringQuery('id', null, 64);
        $sessionId = $this->stringQuery('sessionId', null, 64);
        if ($id === null || $sessionId === null) {
            return ApiResponse::fail('validation_error', 'id and sessionId are required', 400);
        }
        $saved = SavedLocation::findOne(['id' => (int) $id]);
        if ($saved === null || $saved->session_id !== $sessionId) {
            return ApiResponse::fail('not_found', 'Saved location not found', 404);
        }
        $saved->delete();
        return ApiResponse::ok(['deleted' => $id]);
    }
}
