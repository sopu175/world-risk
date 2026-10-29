<?php

namespace api\modules\v1\controllers;

use Yii;
use yii\db\Query;
use api\modules\v1\support\AdminAuth;
use api\modules\v1\support\ApiResponse;
use api\modules\v1\support\Dto;
use api\modules\v1\support\Format;
use console\components\ingest\IngestRunner;

/**
 * /v1/admin/* — data operations. Protected by the x-admin-token filter
 * (open mode when ADMIN_TOKEN is unset; the admin UI surfaces that state).
 *
 * GET   /v1/admin/overview
 * PATCH /v1/admin/sources        {key, enabled?, notes?}
 * POST  /v1/admin/ingest         {sources?: string[], trigger?}
 * GET   /v1/admin/runs?limit=
 * PATCH /v1/admin/corrections    {id, status, adminNote?}
 */
final class AdminController extends BaseController
{
    public function behaviors()
    {
        return [
            'adminAuth' => ['class' => AdminAuth::class],
        ];
    }

    public function actionOverview()
    {
        $sources = (new Query())->from('data_source')->orderBy(['access_mode' => SORT_ASC, 'key' => SORT_ASC])->all();

        $runRows = (new Query())
            ->select(['r.*', 'source_key' => 's.key', 'source_name' => 's.name'])
            ->from(['r' => 'ingestion_run'])
            ->innerJoin(['s' => 'data_source'], 's.id = r.source_id')
            ->orderBy(['r.started_at' => SORT_DESC])
            ->limit(60)
            ->all();

        $corrections = (new Query())->from('correction')->orderBy(['created_at' => SORT_DESC])->limit(50)->all();

        $obsTotal = (new Query())->from('hazard_observation')->count();
        $eventTotal = (new Query())->from('disaster_event')->count();

        $obsByLayer = (new Query())
            ->select(['l.hazard_type', 'l.key', 'cnt' => 'COUNT(o.id)', 'last_at' => 'MAX(o.occurred_at)'])
            ->from(['l' => 'hazard_layer'])
            ->leftJoin(['o' => 'hazard_observation'], 'o.layer_id = l.id')
            ->groupBy('l.id, l.hazard_type, l.key')
            ->all();

        $eventsByType = (new Query())
            ->select(['event_type', 'cnt' => 'COUNT(*)', 'last_at' => 'MAX(start_date)'])
            ->from('disaster_event')
            ->groupBy('event_type')
            ->all();

        // observation/event counts per source (only usgs contributes observations)
        $obsCount = (int) $obsTotal;

        $sourceDtos = array_map(static function (array $s) use ($obsCount, $eventTotal): array {
            $isBulk = (string) $s['access_mode'] === 'bulk';
            $obs = $isBulk && (string) $s['key'] === 'usgs-earthquakes' ? $obsCount : 0;
            $evts = $isBulk && (string) $s['key'] !== 'usgs-earthquakes' ? $eventTotal : 0;
            return Dto::source($s, $obs, $evts);
        }, $sources);

        $openCorrections = 0;
        foreach ($corrections as $c) {
            if ((string) $c['status'] === 'open') {
                $openCorrections++;
            }
        }

        $byLayer = array_map(static function (array $g): array {
            return [
                'layerKey' => (string) $g['key'],
                'count' => (int) $g['cnt'],
                'lastAt' => Format::isoFromDateTime($g['last_at']),
            ];
        }, $obsByLayer);

        $eventsByTypeOut = array_map(static function (array $g): array {
            return [
                'eventType' => (string) $g['event_type'],
                'count' => (int) $g['cnt'],
                'lastAt' => Format::isoFromDateTime($g['last_at']),
            ];
        }, $eventsByType);
        usort($eventsByTypeOut, static fn (array $a, array $b): int => $b['count'] <=> $a['count']);

        return ApiResponse::ok([
            'stats' => [
                'observations' => (int) $obsTotal,
                'events' => (int) $eventTotal,
                'openCorrections' => $openCorrections,
                'totalCorrections' => count($corrections),
                'sourcesActive' => count(array_filter($sourceDtos, static fn (array $s): bool => $s['accessMode'] === 'bulk' && $s['status'] === 'active')),
                'sourcesNeedsConfig' => count(array_filter($sourceDtos, static fn (array $s): bool => $s['status'] === 'needs_config')),
            ],
            'sources' => $sourceDtos,
            'runs' => array_map([Dto::class, 'run'], $runRows),
            'coverage' => [
                'byLayer' => $byLayer,
                'eventsByType' => $eventsByTypeOut,
            ],
            'corrections' => array_map([Dto::class, 'correction'], $corrections),
            'adminAuthMode' => AdminAuth::mode(),
        ]);
    }

    public function actionSources()
    {
        if (Yii::$app->request->method !== 'PATCH') {
            return ApiResponse::fail('method_not_allowed', 'Use PATCH /v1/admin/sources', 405);
        }
        [$body, $err] = $this->readBody([
            'key' => 'string:required',
            'enabled' => 'bool',
            'notes' => 'string',
        ]);
        if ($err !== null) {
            return $err;
        }

        $source = (new Query())->from('data_source')->where(['key' => $body['key']])->one();
        if ($source === null) {
            return ApiResponse::fail('not_found', 'Unknown data source: ' . (string) $body['key'], 404);
        }

        $update = [];
        if (array_key_exists('notes', $body)) {
            $update['notes'] = mb_substr((string) $body['notes'], 0, 500);
        }
        if (isset($body['enabled'])) {
            if ((bool) $body['enabled']) {
                $envVar = $source['requires_api_key_env'];
                $envMissing = $envVar !== null && trim((string) (getenv((string) $envVar) ?: '')) === '';
                $update['enabled'] = true;
                $update['status'] = $envMissing ? 'needs_config' : 'active';
                $update['status_reason'] = $envMissing
                    ? sprintf('Re-enabled, but %s is still not configured.', $envVar)
                    : null;
                $update['consecutive_failures'] = 0;
            } else {
                $update['enabled'] = false;
                $update['status'] = 'disabled';
                $update['status_reason'] = 'Disabled by administrator.';
            }
        }

        if ($update !== []) {
            $update['updated_at'] = Format::nowIso();
            Yii::$app->db->createCommand()
                ->update('data_source', $update, ['key' => $body['key']])
                ->execute();
        }

        $fresh = (new Query())->from('data_source')->where(['key' => $body['key']])->one();
        return ApiResponse::ok([
            'key' => (string) $fresh['key'],
            'enabled' => Dto::boolOf($fresh['enabled']),
            'status' => (string) $fresh['status'],
            'statusReason' => $fresh['status_reason'] !== null ? (string) $fresh['status_reason'] : null,
        ]);
    }

    public function actionIngest()
    {
        if (Yii::$app->request->method !== 'POST') {
            return ApiResponse::fail('method_not_allowed', 'Use POST /v1/admin/ingest', 405);
        }
        $body = Yii::$app->request->bodyParams;
        if (!is_array($body)) {
            $body = [];
        }
        $trigger = isset($body['trigger']) && in_array((string) $body['trigger'], ['manual', 'scheduled', 'bootstrap'], true)
            ? (string) $body['trigger']
            : 'manual';
        $sources = isset($body['sources']) && is_array($body['sources'])
            ? array_slice(array_filter(array_map('strval', $body['sources']), static fn ($k) => $k !== ''), 0, 20)
            : null;

        $outcomes = IngestRunner::run($sources, $trigger);
        return ApiResponse::ok(['outcomes' => $outcomes]);
    }

    public function actionRuns()
    {
        $limit = (int) $this->numericQuery('limit', 50, 1, 200);
        $runRows = (new Query())
            ->select(['r.*', 'source_key' => 's.key', 'source_name' => 's.name'])
            ->from(['r' => 'ingestion_run'])
            ->innerJoin(['s' => 'data_source'], 's.id = r.source_id')
            ->orderBy(['r.started_at' => SORT_DESC])
            ->limit($limit)
            ->all();
        return ApiResponse::ok(['runs' => array_map([Dto::class, 'run'], $runRows)]);
    }

    public function actionCorrections()
    {
        if (Yii::$app->request->method !== 'PATCH') {
            return ApiResponse::fail('method_not_allowed', 'Use PATCH /v1/admin/corrections', 405);
        }
        [$body, $err] = $this->readBody([
            'id' => 'string:required',
            'status' => 'enum:open|resolved|rejected:required',
            'adminNote' => 'string',
        ]);
        if ($err !== null) {
            return $err;
        }

        $update = [
            'status' => (string) $body['status'],
            'admin_note' => isset($body['adminNote']) ? mb_substr((string) $body['adminNote'], 0, 500) : null,
            'resolved_at' => ((string) $body['status']) === 'open' ? null : Format::nowIso(),
        ];
        $affected = Yii::$app->db->createCommand()
            ->update('correction', $update, ['id' => (int) $body['id']])
            ->execute();
        if ($affected === 0) {
            return ApiResponse::fail('not_found', 'Correction not found', 404);
        }
        return ApiResponse::ok([
            'id' => (string) $body['id'],
            'status' => (string) $body['status'],
            'adminNote' => $update['admin_note'],
        ]);
    }
}
