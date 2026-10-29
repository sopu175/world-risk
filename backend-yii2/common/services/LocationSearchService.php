<?php

namespace common\services;

use api\modules\v1\support\Format;
use api\modules\v1\support\TtlCache;
use api\modules\v1\support\Upstream;

/**
 * Forward geocoding via the Open-Meteo Geocoding API (GeoNames).
 * Results are cached in-process for 10 minutes (keyed by query + count).
 *
 * Throws UpstreamException on upstream failure; the controller maps that to
 * HTTP 502 { error: { code: 'search_error', ... } }.
 */
final class LocationSearchService
{
    private static ?TtlCache $cache = null;

    /**
     * @return array<int, array{
     *     id: string, name: string, admin1: ?string, country: ?string,
     *     countryCode: ?string, latitude: float, longitude: float,
     *     elevation: float|null, population: int|null, timezone: ?string,
     *     featureCode: ?string
     * }>
     */
    public static function search(string $q, int $count = 6): array
    {
        $count = max(1, min(10, $count));
        $key = Format::lower(trim($q)) . '::' . $count;

        $cache = self::cache();
        $cached = $cache->get($key);
        if (is_array($cached)) {
            return $cached;
        }

        $url = sprintf(
            'https://geocoding-api.open-meteo.com/v1/search?name=%s&count=%d&language=en&format=json',
            rawurlencode($q),
            $count
        );
        $payload = Upstream::getJson($url, ['timeoutMs' => 12000]);

        $rows = isset($payload['results']) && is_array($payload['results']) ? $payload['results'] : [];
        $results = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            if (!isset($row['name']) || !is_string($row['name']) || $row['name'] === '') {
                continue;
            }
            if (!isset($row['id']) || !is_numeric($row['id'])) {
                continue;
            }
            if (!isset($row['latitude']) || !is_numeric($row['latitude'])) {
                continue;
            }
            if (!isset($row['longitude']) || !is_numeric($row['longitude'])) {
                continue;
            }
            $results[] = [
                'id' => 'gn-' . (string) $row['id'],
                'name' => $row['name'],
                'admin1' => self::strOrNull($row['admin1'] ?? null),
                'country' => self::strOrNull($row['country'] ?? null),
                'countryCode' => self::strOrNull($row['country_code'] ?? null),
                'latitude' => (float) $row['latitude'],
                'longitude' => (float) $row['longitude'],
                'elevation' => isset($row['elevation']) && is_numeric($row['elevation'])
                    ? Format::num($row['elevation'])
                    : null,
                'population' => isset($row['population']) && is_numeric($row['population'])
                    ? (int) $row['population']
                    : null,
                'timezone' => self::strOrNull($row['timezone'] ?? null),
                'featureCode' => self::strOrNull($row['feature_code'] ?? null),
            ];
        }

        $cache->set($key, $results);
        return $results;
    }

    private static function cache(): TtlCache
    {
        if (!self::$cache instanceof TtlCache) {
            self::$cache = new TtlCache(10 * 60, 300);
        }
        return self::$cache;
    }

    private static function strOrNull($value): ?string
    {
        if ($value === null || !is_string($value) || $value === '') {
            return null;
        }
        return $value;
    }
}
