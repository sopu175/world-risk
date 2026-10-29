<?php

namespace api\modules\v1\controllers;

use Yii;
use yii\db\Query;
use api\modules\v1\support\ApiResponse;
use api\modules\v1\support\Format;
use api\modules\v1\support\LayerCatalog;

/**
 * GET /v1/layers
 *
 * Returns the layer registry with live availability computed from imported
 * data — a layer is "live" only when its record count is > 0, mirroring the
 * guarantee that the atlas never presents a layer as available before its
 * source is configured and validated.
 */
final class LayerController extends BaseController
{
    public function actionIndex()
    {
        $layers = (new Query())
            ->from('hazard_layer')
            ->orderBy(['sort_order' => SORT_ASC])
            ->all();

        $obsCounts = (new Query())
            ->select(['layer_id', 'cnt' => 'COUNT(*)', 'last_at' => 'MAX(occurred_at)'])
            ->from('hazard_observation')
            ->groupBy('layer_id')
            ->all();
        $obsByLayer = [];
        foreach ($obsCounts as $c) {
            $obsByLayer[(string) $c['layer_id']] = $c;
        }

        $eventCounts = (new Query())
            ->select(['event_type', 'cnt' => 'COUNT(*)', 'last_at' => 'MAX(start_date)'])
            ->from('disaster_event')
            ->groupBy('event_type')
            ->all();
        $eventsByType = [];
        foreach ($eventCounts as $c) {
            $eventsByType[(string) $c['event_type']] = $c;
        }

        $sources = (new Query())->from('data_source')->all();
        $sourceByKey = [];
        foreach ($sources as $s) {
            $sourceByKey[(string) $s['key']] = $s;
        }

        $dtos = [];
        foreach ($layers as $l) {
            $layerId = (string) $l['id'];
            $hazardType = (string) $l['hazard_type'];
            $sourceKey = $l['source_key'] !== null ? (string) $l['source_key'] : null;

            // Observation-backed layers (earthquake, waves) count from
            // hazard_observation; everything else counts documented events.
            $recordCount = 0;
            $lastAt = null;
            if (isset($obsByLayer[$layerId])) {
                $recordCount = (int) $obsByLayer[$layerId]['cnt'];
                $lastAt = $obsByLayer[$layerId]['last_at'];
            } elseif (isset($eventsByType[$hazardType])) {
                $recordCount = (int) $eventsByType[$hazardType]['cnt'];
                $lastAt = $eventsByType[$hazardType]['last_at'];
            }

            $mapAvailable = (bool) $l['map_available'];
            $src = $sourceKey !== null ? ($sourceByKey[$sourceKey] ?? null) : null;
            $srcStatus = $src !== null ? (string) $src['status'] : null;

            if (!$mapAvailable) {
                $status = 'location_level';
                $statusReason = (string) $l['limitations'] !== '' && $hazardType !== ''
                    ? 'Location-level indicator only (computed from upstream on demand).'
                    : null;
            } elseif ($recordCount > 0) {
                $status = 'live';
                $statusReason = null;
            } elseif ($srcStatus === 'needs_config') {
                $status = 'needs_config';
                $statusReason = $src['status_reason'] ?? null;
            } elseif ($srcStatus === 'failed' || $srcStatus === 'auto_disabled') {
                $status = 'unavailable';
                $statusReason = sprintf('Upstream import failing (%s). Last error: %s', (string) $srcStatus, (string) ($src['status_reason'] ?? 'unknown'));
            } else {
                $status = 'unavailable';
                $statusReason = LayerCatalog::noDataReason((string) $l['key']);
            }

            $legend = LayerCatalog::legend((string) $l['key']);
            $dtos[] = [
                'key' => (string) $l['key'],
                'name' => (string) $l['name'],
                'hazardType' => $hazardType,
                'kind' => (string) $l['kind'],
                'description' => (string) $l['description'],
                'units' => $l['units'] !== null ? (string) $l['units'] : null,
                'methodology' => $l['methodology'] !== null ? (string) $l['methodology'] : null,
                'resolution' => $l['resolution'] !== null ? (string) $l['resolution'] : null,
                'temporalCoverage' => $l['temporal_coverage'] !== null ? (string) $l['temporal_coverage'] : null,
                'licenseName' => $l['license_name'] !== null ? (string) $l['license_name'] : null,
                'licenseUrl' => $l['license_url'] !== null ? (string) $l['license_url'] : null,
                'limitations' => $l['limitations'] !== null ? (string) $l['limitations'] : null,
                'sourceKey' => $sourceKey,
                'colorHex' => (string) $l['color_hex'],
                'mapAvailable' => (bool) $l['map_available'],
                'status' => $status,
                'statusReason' => $statusReason,
                'legend' => $legend,
                'recordCount' => $recordCount,
                'lastUpdatedAt' => Format::isoFromDateTime($lastAt),
            ];
        }

        return ApiResponse::ok(['layers' => $dtos]);
    }
}
