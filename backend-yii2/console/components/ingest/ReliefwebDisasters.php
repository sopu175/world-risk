<?php

namespace console\components\ingest;

use Yii;
use api\modules\v1\support\Format;
use api\modules\v1\support\Upstream;

/**
 * ReliefWeb Disasters API v2 adapter.
 *
 * ReliefWeb requires a registered, approved `appname` (403 otherwise). This
 * adapter only ever runs when RELIEFWEB_APPNAME is configured; until then the
 * source reports needs_config and contributes nothing.
 */
final class ReliefwebDisasters
{
    /**
     * @param callable(string):void $log
     * @return array{recordsFetched:int, recordsInserted:int, recordsUpdated:int, recordsSkipped:int, recordsInvalid:int, datasetVersion:?string}
     */
    public static function run(int $sourceId, callable $log): array
    {
        $appname = trim((string) (getenv('RELIEFWEB_APPNAME') ?: ''));
        if ($appname === '') {
            throw new \RuntimeException('RELIEFWEB_APPNAME is not configured — source cannot run');
        }

        $url = sprintf(
            'https://api.reliefweb.int/v2/disasters?appname=%s&profile=list&limit=200&sort%%5B%%5D=date%%3Adesc',
            rawurlencode($appname)
        );
        $payload = Upstream::getJson($url, ['timeoutMs' => 30000]);
        $rows = $payload['data'] ?? null;
        if (!is_array($rows)) {
            throw new \RuntimeException('ReliefWeb payload missing data array');
        }
        $log(sprintf('fetched %d ReliefWeb disaster records', count($rows)));

        $existingRows = (new \yii\db\Query())
            ->select(['external_id', 'title'])
            ->from('disaster_event')
            ->where(['source_id' => $sourceId])
            ->all();
        $existing = [];
        foreach ($existingRows as $r) {
            $existing[(string) $r['external_id']] = (string) $r['title'];
        }

        $inserted = 0;
        $updated = 0;
        $skipped = 0;
        $invalid = 0;
        $latest = null;

        foreach ($rows as $rec) {
            if (!is_array($rec) || !isset($rec['id'], $rec['fields']) || !is_array($rec['fields'])) {
                $invalid++;
                continue;
            }
            $f = $rec['fields'];
            if (!isset($f['name']) || !is_string($f['name']) || $f['name'] === '') {
                $invalid++;
                continue;
            }

            $typeName = isset($f['disaster_type']['name']) && is_string($f['disaster_type']['name']) ? $f['disaster_type']['name'] : null;
            $eventType = self::mapType($typeName);

            $dateEvent = $f['date']['event'] ?? null;
            if (!is_string($dateEvent) || $dateEvent === '' || ($startTs = strtotime($dateEvent)) === false) {
                $invalid++;
                continue;
            }

            $country = isset($f['country'][0]) && is_array($f['country'][0]) ? $f['country'][0] : null;
            $loc = $country !== null && isset($country['location']) && is_array($country['location']) ? $country['location'] : null;
            $lat = $loc !== null && isset($loc['lat']) && is_numeric($loc['lat']) ? (float) $loc['lat'] : null;
            $lng = $loc !== null && isset($loc['lon']) && is_numeric($loc['lon']) ? (float) $loc['lon'] : null;

            $status = isset($f['status']) && is_string($f['status']) ? $f['status'] : '';
            $kind = $status === 'current' || $status === 'alert' ? 'active' : 'historical';

            $sourceUrl = null;
            if (isset($f['url_alias']) && is_string($f['url_alias']) && $f['url_alias'] !== '') {
                $sourceUrl = 'https://reliefweb.int/disaster/' . $f['url_alias'];
            } elseif (isset($f['url']) && is_string($f['url'])) {
                $sourceUrl = $f['url'];
            }

            $startIso = gmdate('Y-m-d\TH:i:s\Z', $startTs);
            if ($latest === null || $startIso > $latest) {
                $latest = $startIso;
            }

            $summary = isset($f['description']) && is_string($f['description'])
                ? mb_substr(trim(strip_tags($f['description'])), 0, 600)
                : null;

            $row = [
                'title' => mb_substr($f['name'], 0, 300),
                'event_type' => $eventType,
                'kind' => $kind,
                'lat' => $lat,
                'lng' => $lng,
                'place_name' => null,
                'country_name' => $country !== null && isset($country['name']) && is_string($country['name']) ? $country['name'] : null,
                'country_code' => null,
                'start_date' => $startIso,
                'end_date' => null,
                'source_url' => $sourceUrl,
                'summary' => $summary,
                'verification_status' => 'source_reported',
                'updated_at' => Format::nowIso(),
            ];

            $externalId = (string) $rec['id'];
            try {
                if (!isset($existing[$externalId])) {
                    Yii::$app->db->createCommand()->insert('disaster_event', array_merge($row, [
                        'source_id' => $sourceId,
                        'external_id' => $externalId,
                        'source_name' => 'ReliefWeb (UN OCHA)',
                        'ingested_at' => Format::nowIso(),
                    ]))->execute();
                    $existing[$externalId] = $row['title'];
                    $inserted++;
                } elseif ($existing[$externalId] !== $row['title']) {
                    Yii::$app->db->createCommand()->update('disaster_event', $row, [
                        'source_id' => $sourceId,
                        'external_id' => $externalId,
                    ])->execute();
                    $updated++;
                } else {
                    $skipped++;
                }
            } catch (\Throwable $e) {
                $log(sprintf('row %s failed: %s', $externalId, mb_substr($e->getMessage(), 0, 150)));
                $invalid++;
            }
        }

        $log(sprintf('inserted=%d updated=%d skipped=%d invalid=%d', $inserted, $updated, $skipped, $invalid));

        return [
            'recordsFetched' => count($rows),
            'recordsInserted' => $inserted,
            'recordsUpdated' => $updated,
            'recordsSkipped' => $skipped,
            'recordsInvalid' => $invalid,
            'datasetVersion' => $latest,
        ];
    }

    private static function mapType(?string $typeName): string
    {
        if ($typeName === null) {
            return 'other';
        }
        $n = strtolower($typeName);
        if (str_contains($n, 'flood')) {
            return 'flood';
        }
        if (str_contains($n, 'earthquake')) {
            return 'earthquake';
        }
        if (str_contains($n, 'cyclone') || str_contains($n, 'storm')) {
            return 'cyclone';
        }
        if (str_contains($n, 'drought')) {
            return 'drought';
        }
        if (str_contains($n, 'fire')) {
            return 'wildfire';
        }
        if (str_contains($n, 'slide')) {
            return 'landslide';
        }
        if (str_contains($n, 'heat')) {
            return 'extreme_heat';
        }
        if (str_contains($n, 'volcan')) {
            return 'volcano';
        }
        return 'other';
    }
}
