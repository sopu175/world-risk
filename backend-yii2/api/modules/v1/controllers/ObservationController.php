<?php

namespace api\modules\v1\controllers;

use Yii;
use yii\db\Query;
use api\modules\v1\support\ApiResponse;
use api\modules\v1\support\Dto;
use api\modules\v1\support\Geo;

/**
 * GET /v1/observations?layer=&bbox=&limit=&minMagnitude=
 *
 * Point observations. Currently only earthquakes are stored as quantitative
 * point observations; other hazards are event-backed (see /v1/events).
 */
final class ObservationController extends BaseController
{
    public function actionIndex()
    {
        $layer = $this->stringQuery('layer', 'all', 30) ?? 'all';
        $bboxRaw = $this->stringQuery('bbox', null, 80);
        $limit = (int) $this->numericQuery('limit', 3000, 1, 5000);
        $minMagParam = Yii::$app->request->getQueryParam('minMagnitude');

        if ($layer !== 'all' && $layer !== 'earthquake') {
            return ApiResponse::ok([
                'observations' => [],
                'meta' => [
                    'note' => "No point-observation layer for '{$layer}' — events are served via /v1/events",
                ],
            ]);
        }

        $bbox = Geo::parseBbox($bboxRaw);
        if ($bboxRaw !== null && $bbox === null) {
            return ApiResponse::fail('validation_error', 'bbox must be west,south,east,north in valid ranges', 400);
        }

        $query = (new Query())
            ->select([
                'id', 'external_id', 'lat', 'lng', 'magnitude', 'magnitude_type',
                'depth_km', 'value', 'unit', 'severity_label', 'place',
                'country_code', 'occurred_at', 'source_url',
            ])
            ->from('hazard_observation')
            ->where(['=', 'hazard_observation.layer_id', (new Query())
                ->select('id')->from('hazard_layer')->where(['key' => 'earthquake'])->scalar()]);

        if ($bbox !== null) {
            $query->andFilterWhere(['>=', 'lat', $bbox['south']])
                  ->andFilterWhere(['<=', 'lat', $bbox['north']]);
            if ($bbox['west'] <= $bbox['east']) {
                $query->andFilterWhere(['>=', 'lng', $bbox['west']])
                      ->andFilterWhere(['<=', 'lng', $bbox['east']]);
            } else {
                // antimeridian-crossing bbox
                $query->andFilterWhere(['or', ['>=', 'lng', $bbox['west']], ['<=', 'lng', $bbox['east']]]);
            }
        }

        if ($minMagParam !== null && is_numeric($minMagParam)) {
            $query->andFilterWhere(['>=', 'magnitude', (float) $minMagParam]);
        }

        $rows = $query->orderBy(['magnitude' => SORT_DESC, 'occurred_at' => SORT_DESC])
                      ->limit($limit)
                      ->all();

        $lastRun = (new Query())
            ->select(['r.dataset_version', 'r.finished_at'])
            ->from(['r' => 'ingestion_run'])
            ->innerJoin(['s' => 'data_source'], 's.id = r.source_id')
            ->where(['s.key' => 'usgs-earthquakes'])
            ->andWhere(['r.status' => ['success', 'partial']])
            ->orderBy(['r.started_at' => SORT_DESC])
            ->limit(1)
            ->one();

        return ApiResponse::ok([
            'observations' => array_map(
                static fn (array $row): array => Dto::observation($row, 'earthquake'),
                $rows
            ),
            'meta' => [
                'datasetVersion' => $lastRun['dataset_version'] ?? null,
                'generatedAt' => isset($lastRun['finished_at']) ? \api\modules\v1\support\Format::isoFromDateTime($lastRun['finished_at']) : null,
                'truncated' => count($rows) >= $limit,
            ],
        ]);
    }
}
