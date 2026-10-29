<?php

namespace console\components\ingest;

use Yii;
use api\modules\v1\support\Format;
use api\modules\v1\support\Upstream;

/**
 * USGS Earthquake Hazards Program adapter — M2.5+ past-30-day composite feed.
 *
 * Strategy (mirrors src/lib/ingest/usgs-earthquakes.ts):
 *  - full per-feature validation before anything touches the DB
 *  - diff against stored external ids: bulk-insert new rows, update only rows
 *    whose occurred time was revised by the source, count the rest as skipped
 *  - never delete existing data
 */
final class UsgsEarthquakes
{
    private const FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson';

    /**
     * @param callable(string):void $log
     * @return array{recordsFetched:int, recordsInserted:int, recordsUpdated:int, recordsSkipped:int, recordsInvalid:int, datasetVersion:?string}
     */
    public static function run(int $sourceId, callable $log): array
    {
        $payload = Upstream::getJson(self::FEED_URL, ['timeoutMs' => 30000, 'maxBytes' => 31457280]);
        if (!isset($payload['features']) || !is_array($payload['features'])) {
            throw new \RuntimeException('USGS feed missing features array');
        }
        $features = $payload['features'];
        $generated = $payload['metadata']['generated'] ?? null;
        $log(sprintf('fetched %d features (feed count=%s)', count($features), (string) ($payload['metadata']['count'] ?? '?')));

        $layerId = (new \yii\db\Query())->select('id')->from('hazard_layer')->where(['key' => 'earthquake'])->scalar();
        if ($layerId === false) {
            throw new \RuntimeException('earthquake layer missing from registry — run migrations');
        }

        // Existing dedup map: external_id => epoch ms
        $existingRows = (new \yii\db\Query())
            ->select(['external_id', 'occurred_at'])
            ->from('hazard_observation')
            ->where(['source_id' => $sourceId])
            ->all();
        $existing = [];
        foreach ($existingRows as $row) {
            $ms = Format::epochMsFromDateTime($row['occurred_at']);
            $existing[(string) $row['external_id']] = $ms;
        }

        $valid = [];
        $invalid = 0;
        $filteredLowMag = 0;

        foreach ($features as $f) {
            if (!is_array($f) || !isset($f['id'], $f['properties'], $f['geometry']['coordinates'])) {
                $invalid++;
                continue;
            }
            $props = $f['properties'];
            $coords = $f['geometry']['coordinates'];
            if (!is_array($coords) || count($coords) < 3) {
                $invalid++;
                continue;
            }
            $lng = $coords[0];
            $lat = $coords[1];
            $depth = $coords[2];
            $mag = $props['mag'] ?? null;
            $timeMs = $props['time'] ?? null;

            if (!is_numeric($lat) || !is_numeric($lng) || abs((float) $lat) > 90 || abs((float) $lng) > 180) {
                $invalid++;
                continue;
            }
            if (!is_numeric($timeMs)) {
                $invalid++;
                continue;
            }
            if ($mag === null || !is_numeric($mag)) {
                $invalid++;
                continue;
            }
            if ((float) $mag < 2.5) {
                $filteredLowMag++;
                continue;
            }

            $valid[] = [
                'externalId' => (string) $f['id'],
                'lat' => (float) $lat,
                'lng' => (float) $lng,
                'depthKm' => is_numeric($depth) ? (float) $depth : 0.0,
                'mag' => (float) $mag,
                'magType' => is_string($props['magType'] ?? null) ? $props['magType'] : null,
                'place' => is_string($props['place'] ?? null) ? $props['place'] : null,
                'timeMs' => (int) round((float) $timeMs),
                'url' => is_string($props['url'] ?? null) ? $props['url'] : null,
                'raw' => json_encode([
                    'id' => $f['id'],
                    'mag' => $mag,
                    'magType' => $props['magType'] ?? null,
                    'place' => $props['place'] ?? null,
                    'time' => $timeMs,
                    'updated' => $props['updated'] ?? null,
                    'status' => $props['status'] ?? null,
                    'tsunami' => $props['tsunami'] ?? null,
                    'sig' => $props['sig'] ?? null,
                    'url' => $props['url'] ?? null,
                ], JSON_UNESCAPED_UNICODE),
            ];
        }

        $toCreate = [];
        $toUpdate = [];
        $skipped = 0;
        foreach ($valid as $row) {
            $prev = $existing[$row['externalId']] ?? null;
            if ($prev === null) {
                $toCreate[] = $row;
            } elseif ($prev !== $row['timeMs']) {
                $toUpdate[] = $row;
            } else {
                $skipped++;
            }
        }

        $db = Yii::$app->db;
        $inserted = 0;
        $updated = 0;

        // Bulk insert in chunks; a unique-key race falls back to per-row upserts.
        $chunkSize = 400;
        foreach (array_chunk($toCreate, $chunkSize) as $chunk) {
            try {
                $db->createCommand()->batchInsert(
                    'hazard_observation',
                    ['source_id', 'layer_id', 'external_id', 'lat', 'lng', 'magnitude', 'magnitude_type', 'depth_km', 'occurred_at', 'place', 'source_url', 'raw_json', 'ingested_at'],
                    array_map(static fn (array $r): array => [
                        $sourceId,
                        $layerId,
                        $r['externalId'],
                        $r['lat'],
                        $r['lng'],
                        $r['mag'],
                        $r['magType'],
                        $r['depthKm'],
                        gmdate('Y-m-d\TH:i:s\Z', intdiv($r['timeMs'], 1000)),
                        $r['place'],
                        $r['url'],
                        $r['raw'],
                        Format::nowIso(),
                    ], $chunk)
                )->execute();
                $inserted += count($chunk);
            } catch (\Throwable $e) {
                foreach ($chunk as $r) {
                    try {
                        $db->createCommand()->insert('hazard_observation', [
                            'source_id' => $sourceId,
                            'layer_id' => $layerId,
                            'external_id' => $r['externalId'],
                            'lat' => $r['lat'],
                            'lng' => $r['lng'],
                            'magnitude' => $r['mag'],
                            'magnitude_type' => $r['magType'],
                            'depth_km' => $r['depthKm'],
                            'occurred_at' => gmdate('Y-m-d\TH:i:s\Z', intdiv($r['timeMs'], 1000)),
                            'place' => $r['place'],
                            'source_url' => $r['url'],
                            'raw_json' => $r['raw'],
                            'ingested_at' => Format::nowIso(),
                        ])->execute();
                        $inserted++;
                    } catch (\Throwable $e2) {
                        // genuine duplicate (e.g. race with another worker) — count as skipped
                    }
                }
            }
        }

        foreach ($toUpdate as $r) {
            $affected = $db->createCommand()->update(
                'hazard_observation',
                [
                    'magnitude' => $r['mag'],
                    'magnitude_type' => $r['magType'],
                    'depth_km' => $r['depthKm'],
                    'place' => $r['place'],
                    'occurred_at' => gmdate('Y-m-d\TH:i:s\Z', intdiv($r['timeMs'], 1000)),
                    'source_url' => $r['url'],
                ],
                ['source_id' => $sourceId, 'external_id' => $r['externalId']]
            )->execute();
            $updated += $affected > 0 ? 1 : 0;
            if ($affected === 0) {
                $skipped++;
            }
        }

        // Layer becomes available only after a validated import exists.
        $db->createCommand()->update('hazard_layer', ['available' => true, 'updated_at' => Format::nowIso()], ['key' => 'earthquake'])->execute();

        $log(sprintf('inserted=%d updated=%d skipped=%d invalid=%d (mag<2.5 filtered: %d)', $inserted, $updated, $skipped, $invalid, $filteredLowMag));

        return [
            'recordsFetched' => count($features),
            'recordsInserted' => $inserted,
            'recordsUpdated' => $updated,
            'recordsSkipped' => $skipped + $filteredLowMag,
            'recordsInvalid' => $invalid,
            'datasetVersion' => is_numeric($generated) ? Format::isoFromEpochMs((int) $generated) : null,
        ];
    }
}
