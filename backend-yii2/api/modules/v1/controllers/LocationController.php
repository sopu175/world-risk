<?php

namespace api\modules\v1\controllers;

use Yii;
use api\modules\v1\support\ApiResponse;
use common\services\LocationDetailService;
use common\services\LocationSearchService;

/**
 * POST /v1/locations/detail   — aggregated location profile
 * GET  /v1/locations/search   — forward geocoding (Open-Meteo / GeoNames)
 * POST /v1/locations/compare  — reference-city comparison
 */
final class LocationController extends BaseController
{
    public function actionSearch()
    {
        $q = $this->stringQuery('q', null, 80);
        if ($q === null || mb_strlen($q) < 2) {
            return ApiResponse::fail('validation_error', 'q must be at least 2 characters', 400);
        }
        $count = (int) $this->numericQuery('count', 6, 1, 10);
        try {
            $results = LocationSearchService::search($q, $count);
        } catch (\Throwable $e) {
            return ApiResponse::fail('search_error', 'Location search failed: ' . mb_substr($e->getMessage(), 0, 200), 502);
        }
        return ApiResponse::ok([
            'results' => $results,
            'attribution' => 'Geocoding by Open-Meteo / GeoNames (CC-BY 4.0)',
        ]);
    }

    public function actionDetail()
    {
        [$body, $err] = $this->readBody([
            'latitude' => 'number:required',
            'longitude' => 'number:required',
            'name' => 'string',
            'country' => 'string',
            'countryCode' => 'string',
        ]);
        if ($err !== null) {
            return $err;
        }
        if ($body['latitude'] < -90 || $body['latitude'] > 90) {
            return ApiResponse::fail('validation_error', 'latitude out of range', 400);
        }
        if ($body['longitude'] < -180 || $body['longitude'] > 180) {
            return ApiResponse::fail('validation_error', 'longitude out of range', 400);
        }

        try {
            $detail = LocationDetailService::detail($body);
        } catch (\Throwable $e) {
            return ApiResponse::fail('location_detail_error', 'Failed to build location profile: ' . mb_substr($e->getMessage(), 0, 200), 500);
        }
        return ApiResponse::ok($detail);
    }

    public function actionCompare()
    {
        [$body, $err] = $this->readBody([
            'latitude' => 'number:required',
            'longitude' => 'number:required',
        ]);
        if ($err !== null) {
            return $err;
        }
        if ($body['latitude'] < -90 || $body['latitude'] > 90 || $body['longitude'] < -180 || $body['longitude'] > 180) {
            return ApiResponse::fail('validation_error', 'coordinates out of range', 400);
        }
        try {
            $rows = LocationDetailService::compare($body);
        } catch (\Throwable $e) {
            return ApiResponse::fail('compare_error', 'Failed to compare locations: ' . mb_substr($e->getMessage(), 0, 200), 500);
        }
        return ApiResponse::ok(['rows' => $rows]);
    }
}
