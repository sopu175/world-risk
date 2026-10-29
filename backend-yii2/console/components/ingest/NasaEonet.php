<?php

namespace console\components\ingest;

use Yii;
use api\modules\v1\support\Format;
use api\modules\v1\support\Upstream;

/**
 * NASA EONET v3 adapter — natural events (wildfires, severe storms/cyclones,
 * floods, droughts, landslides, volcanoes). Public domain (NASA).
 *
 * Dedup key: EONET event id. Position: the LAST geometry entry of the event
 * track, found by deep-first search for the first valid [lng, lat] pair —
 * Point geometries are flat arrays, Polygons nest arbitrarily deep.
 */
final class NasaEonet
{
    private const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=365&limit=500';

    private const CATEGORY_MAP = [
        'severeStorms' => 'cyclone',
        'wildfires' => 'wildfire',
        'floods' => 'flood',
        'drought' => 'drought',
        'droughts' => 'drought',
        'landslides' => 'landslide',
        'volcanoes' => 'volcano',
        'seaLakeIce' => 'other',
        'dustHaze' => 'other',
        'snow' => 'other',
        'manmade' => 'other',
    ];

    /**
     * @param callable(string):void $log
     * @return array{recordsFetched:int, recordsInserted:int, recordsUpdated:int, recordsSkipped:int, recordsInvalid:int, datasetVersion:?string}
     */
    public static function run(int $sourceId, callable $log): array
    {
        $payload = Upstream::getJson(self::EONET_URL, ['timeoutMs' => 30000]);
        $events = $payload['events'] ?? null;
        if (!is_array($events)) {
            throw new \RuntimeException('EONET payload missing events array');
        }
        $log(sprintf('fetched %d EONET events (12-month window)', count($events)));

        // Layer keys by hazard type (only event-backed layers get flagged).
        $layerRows = (new \yii\db\Query())->select(['id', 'key', 'hazard_type'])->from('hazard_layer')->all();
        $layerIdByKey = [];
        $hazardTypeByKey = [];
        foreach ($layerRows as $l) {
            $layerIdByKey[(string) $l['key']] = (int) $l['id'];
            $hazardTypeByKey[(string) $l['key']] = (string) $l['hazard_type'];
        }

        // Existing events for change detection
        $existingRows = (new \yii\db\Query())
            ->select(['external_id', 'title', 'kind', 'severity_value', 'lat', 'lng', 'end_date'])
            ->from('disaster_event')
            ->where(['source_id' => $sourceId])
            ->all();
        $existing = [];
        foreach ($existingRows as $r) {
            $existing[(string) $r['external_id']] = $r;
        }

        $inserted = 0;
        $updated = 0;
        $skipped = 0;
        $invalid = 0;
        $maxSeen = 0.0;

        foreach ($events as $ev) {
            if (!is_array($ev) || !isset($ev['id'], $ev['title'], $ev['categories'], $ev['geometry']) || !is_array($ev['geometry']) || $ev['geometry'] === []) {
                $invalid++;
                continue;
            }
            $catId = (string) ($ev['categories'][0]['id'] ?? '');
            $eventType = self::CATEGORY_MAP[$catId] ?? 'other';

            $firstGeom = $ev['geometry'][0];
            $lastGeom = $ev['geometry'][count($ev['geometry']) - 1];
            if (!is_array($firstGeom) || !is_array($lastGeom)) {
                $invalid++;
                continue;
            }

            $openRaw = $firstGeom['date'] ?? null;
            if (!is_string($openRaw) || $openRaw === '') {
                $invalid++;
                continue;
            }
            $openTs = strtotime($openRaw);
            if ($openTs === false) {
                $invalid++;
                continue;
            }

            $pos = self::firstCoordPair($lastGeom['coordinates'] ?? null);
            if ($pos === null) {
                $invalid++;
                continue;
            }
            [$lng, $lat] = $pos;

            $closedRaw = $ev['closed'] ?? null;
            $endTs = null;
            if (is_string($closedRaw) && $closedRaw !== '') {
                $t = strtotime($closedRaw);
                $endTs = $t === false ? null : $t;
            }

            $sevVal = isset($lastGeom['magnitudeValue']) && is_numeric($lastGeom['magnitudeValue']) ? (float) $lastGeom['magnitudeValue'] : null;
            $sevUnit = isset($lastGeom['magnitudeUnit']) && is_string($lastGeom['magnitudeUnit']) ? $lastGeom['magnitudeUnit'] : null;
            $severityLabel = null;
            if ($eventType === 'cyclone' && $sevVal !== null && $sevUnit !== null && stripos($sevUnit, 'kt') === 0) {
                $severityLabel = self::cycloneSeverityLabel($sevVal);
            }

            $sources = isset($ev['sources']) && is_array($ev['sources']) ? $ev['sources'] : [];
            $verification = count($sources) >= 2 ? 'cross_verified' : 'source_reported';

            $kind = $closedRaw === null || $closedRaw === '' ? 'active' : 'historical';

            $geomDate = isset($lastGeom['date']) && is_string($lastGeom['date']) ? $lastGeom['date'] : null;
            if ($geomDate !== null) {
                $t = strtotime($geomDate);
                if ($t !== false) {
                    $maxSeen = max($maxSeen, $t);
                }
            }

            $row = [
                'title' => mb_substr((string) $ev['title'], 0, 300),
                'event_type' => $eventType,
                'kind' => $kind,
                'lat' => $lat,
                'lng' => $lng,
                'start_date' => gmdate('Y-m-d\TH:i:s\Z', $openTs),
                'end_date' => $endTs !== null ? gmdate('Y-m-d\TH:i:s\Z', $endTs) : null,
                'severity_value' => $sevVal,
                'severity_unit' => $sevUnit,
                'severity_label' => $severityLabel,
                'verification_status' => $verification,
                'summary' => isset($ev['description']) && is_string($ev['description']) ? mb_substr($ev['description'], 0, 600) : null,
                'source_url' => isset($ev['link']) && is_string($ev['link']) ? $ev['link'] : null,
            ];

            $prev = $existing[(string) $ev['id']] ?? null;
            try {
                if ($prev === null) {
                    Yii::$app->db->createCommand()->insert('disaster_event', array_merge($row, [
                        'source_id' => $sourceId,
                        'external_id' => (string) $ev['id'],
                        'source_name' => 'NASA EONET',
                        'ingested_at' => Format::nowIso(),
                        'updated_at' => Format::nowIso(),
                    ]))->execute();
                    $inserted++;
                } else {
                    $changed =
                        (string) $prev['title'] !== $row['title'] ||
                        (string) $prev['kind'] !== $row['kind'] ||
                        (float) ($prev['severity_value'] ?? 0) !== (float) ($row['severity_value'] ?? 0) ||
                        abs((float) $prev['lat'] - $row['lat']) > 1e-9 ||
                        abs((float) $prev['lng'] - $row['lng']) > 1e-9 ||
                        Format::isoFromDateTime($prev['end_date']) !== $row['end_date'];
                    if ($changed) {
                        Yii::$app->db->createCommand()->update('disaster_event', array_merge($row, [
                            'updated_at' => Format::nowIso(),
                        ]), ['source_id' => $sourceId, 'external_id' => (string) $ev['id']])->execute();
                        $updated++;
                    } else {
                        $skipped++;
                    }
                }
            } catch (\Throwable $e) {
                $log(sprintf('row %s failed: %s', (string) $ev['id'], mb_substr($e->getMessage(), 0, 150)));
                $invalid++;
            }
        }

        // Mark event-backed layers available when their hazard type has data.
        foreach ($layerIdByKey as $key => $layerId) {
            $hazardType = $hazardTypeByKey[$key];
            if ($hazardType === 'earthquake') {
                continue;
            }
            $count = (new \yii\db\Query())->from('disaster_event')->where(['event_type' => $hazardType])->count();
            if ((int) $count > 0) {
                Yii::$app->db->createCommand()->update('hazard_layer', ['available' => true, 'updated_at' => Format::nowIso()], ['id' => $layerId])->execute();
            }
        }

        $log(sprintf('inserted=%d updated=%d skipped=%d invalid=%d', $inserted, $updated, $skipped, $invalid));

        return [
            'recordsFetched' => count($events),
            'recordsInserted' => $inserted,
            'recordsUpdated' => $updated,
            'recordsSkipped' => $skipped,
            'recordsInvalid' => $invalid,
            'datasetVersion' => $maxSeen > 0 ? gmdate('Y-m-d\TH:i:s\Z', (int) $maxSeen) : null,
        ];
    }

    /** @return array{0:float,1:float}|null [lng, lat] */
    private static function firstCoordPair($coords): ?array
    {
        if (!is_array($coords)) {
            return null;
        }
        // Point: flat [lng, lat]
        if (count($coords) >= 2 && is_numeric($coords[0]) && is_numeric($coords[1])) {
            $lng = (float) $coords[0];
            $lat = (float) $coords[1];
            if (abs($lat) <= 90 && abs($lng) <= 180) {
                return [$lng, $lat];
            }
            return null;
        }
        // Deep-first search for nested geometries (LineString/Polygon/...)
        $stack = $coords;
        while ($stack !== []) {
            $cur = array_shift($stack);
            if (!is_array($cur)) {
                continue;
            }
            if (count($cur) >= 2 && is_numeric($cur[0]) && is_numeric($cur[1])) {
                $lng = (float) $cur[0];
                $lat = (float) $cur[1];
                if (abs($lat) <= 90 && abs($lng) <= 180) {
                    return [$lng, $lat];
                }
                continue;
            }
            foreach ($cur as $child) {
                $stack[] = $child;
            }
        }
        return null;
    }

    private static function cycloneSeverityLabel(float $kts): string
    {
        if ($kts >= 96) {
            return 'Major hurricane force (≥96 kts)';
        }
        if ($kts >= 64) {
            return 'Hurricane force (64–95 kts)';
        }
        if ($kts >= 34) {
            return 'Tropical storm force (34–63 kts)';
        }
        return 'Tropical depression (<34 kts)';
    }
}
