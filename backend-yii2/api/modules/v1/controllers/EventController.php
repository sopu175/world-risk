<?php

namespace api\modules\v1\controllers;

use Yii;
use yii\db\Query;
use api\modules\v1\support\ApiResponse;
use api\modules\v1\support\Dto;
use api\modules\v1\support\Format;
use api\modules\v1\support\Geo;

/**
 * GET /v1/events          — documented disaster events (filterable)
 * GET /v1/events/summary  — counts by type/kind for dashboard chips
 */
final class EventController extends BaseController
{
    public function actionIndex()
    {
        $type = $this->stringQuery('type', 'all', 30) ?? 'all';
        $kind = $this->stringQuery('kind', 'all', 20) ?? 'all';
        $bboxRaw = $this->stringQuery('bbox', null, 80);
        $days = (int) $this->numericQuery('days', 365, 1, 3650);
        $limit = (int) $this->numericQuery('limit', 400, 1, 1000);

        if (!in_array($kind, ['all', 'historical', 'active', 'model', 'projection'], true)) {
            return ApiResponse::fail('validation_error', 'kind must be all|historical|active|model|projection', 400);
        }

        $bbox = Geo::parseBbox($bboxRaw);
        if ($bboxRaw !== null && $bbox === null) {
            return ApiResponse::fail('validation_error', 'bbox must be west,south,east,north in valid ranges', 400);
        }

        $since = gmdate('Y-m-d\TH:i:s\Z', time() - $days * 86400);

        $query = (new Query())->from('disaster_event')
            ->andFilterWhere(['>=', 'start_date', $since]);
        if ($type !== 'all') {
            $query->andFilterWhere(['event_type' => $type]);
        }
        if ($kind !== 'all') {
            $query->andFilterWhere(['kind' => $kind]);
        }
        if ($bbox !== null) {
            $query->andFilterWhere(['>=', 'lat', $bbox['south']])
                  ->andFilterWhere(['<=', 'lat', $bbox['north']])
                  ->andFilterWhere(['is not', 'lat', null])
                  ->andFilterWhere(['is not', 'lng', null]);
            if ($bbox['west'] <= $bbox['east']) {
                $query->andFilterWhere(['>=', 'lng', $bbox['west']])
                      ->andFilterWhere(['<=', 'lng', $bbox['east']]);
            } else {
                $query->andFilterWhere(['or', ['>=', 'lng', $bbox['west']], ['<=', 'lng', $bbox['east']]]);
            }
        }

        $rows = $query->orderBy(['start_date' => SORT_DESC])->limit($limit)->all();

        return ApiResponse::ok([
            'events' => array_map(
                static fn (array $row): array => Dto::event($row),
                $rows
            ),
            'meta' => [
                'count' => count($rows),
                'truncated' => count($rows) >= $limit,
                'windowDays' => $days,
            ],
        ]);
    }

    public function actionSummary()
    {
        $byType = (new Query())
            ->select(['event_type', 'cnt' => 'COUNT(*)', 'last_at' => 'MAX(start_date)'])
            ->from('disaster_event')
            ->groupBy('event_type')
            ->all();

        $activeByType = (new Query())
            ->select(['event_type', 'cnt' => 'COUNT(*)'])
            ->from('disaster_event')
            ->where(['kind' => 'active'])
            ->groupBy('event_type')
            ->all();
        $activeMap = [];
        foreach ($activeByType as $g) {
            $activeMap[(string) $g['event_type']] = (int) $g['cnt'];
        }

        $range = (new Query())
            ->select([
                'total' => 'COUNT(*)',
                'min_start' => 'MIN(start_date)',
                'max_start' => 'MAX(start_date)',
            ])
            ->from('disaster_event')
            ->one();

        $rows = array_map(static function (array $g) use ($activeMap): array {
            return [
                'eventType' => (string) $g['event_type'],
                'count' => (int) $g['cnt'],
                'activeCount' => $activeMap[(string) $g['event_type']] ?? 0,
                'lastAt' => Format::isoFromDateTime($g['last_at']),
            ];
        }, $byType);

        usort($rows, static fn (array $a, array $b): int => $b['count'] <=> $a['count']);

        return ApiResponse::ok([
            'total' => (int) ($range['total'] ?? 0),
            'activeCount' => array_sum($activeMap),
            'byType' => $rows,
            'coverageStart' => Format::isoFromDateTime($range['min_start'] ?? null),
            'coverageEnd' => Format::isoFromDateTime($range['max_start'] ?? null),
        ]);
    }
}
