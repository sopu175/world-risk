<?php

namespace common\services;

use Yii;
use yii\db\Query;
use api\modules\v1\support\Format;
use api\modules\v1\support\Geo;
use api\modules\v1\support\TtlCache;
use api\modules\v1\support\Upstream;

/**
 * Location intelligence: reverse geocoding, earthquake history, extreme-heat
 * profile, air quality and nearby documented events — each indicator fails
 * independently (available:false + reason), mirroring the sandbox contract.
 *
 * Caching: in-process TTL caches keyed by rounded grid cells. Nominatim is
 * additionally throttled to ≥1.1 s between calls (OSMF usage policy).
 */
final class LocationDetailService
{
    private static ?TtlCache $reverseCache = null;
    private static ?TtlCache $forecastCache = null;
    private static ?TtlCache $quakeCache = null;
    private static ?TtlCache $heatCache = null;
    private static ?TtlCache $airCache = null;
    private static float $lastNominatimAt = 0.0;

    /** Reference cities for the comparison table (real coordinates). */
    private const REFERENCE_LOCATIONS = [
        ['name' => 'London', 'country' => 'United Kingdom', 'lat' => 51.5074, 'lng' => -0.1278],
        ['name' => 'New York', 'country' => 'United States', 'lat' => 40.7128, 'lng' => -74.006],
        ['name' => 'Singapore', 'country' => 'Singapore', 'lat' => 1.3521, 'lng' => 103.8198],
        ['name' => 'Cairo', 'country' => 'Egypt', 'lat' => 30.0444, 'lng' => 31.2357],
        ['name' => 'São Paulo', 'country' => 'Brazil', 'lat' => -23.5505, 'lng' => -46.6333],
        ['name' => 'Sydney', 'country' => 'Australia', 'lat' => -33.8688, 'lng' => 151.2093],
    ];

    // ------------------------------------------------------------------
    // Public entry points
    // ------------------------------------------------------------------

    /**
     * Builds the full location profile.
     *
     * @param array{latitude:float, longitude:float, name?:?string, country?:?string, countryCode?:?string} $input
     */
    public static function detail(array $input): array
    {
        $lat = (float) $input['latitude'];
        $lng = (float) $input['longitude'];

        $reverse = null;
        $forecast = null;
        try {
            $reverse = self::reverseGeocode($lat, $lng);
        } catch (\Throwable $e) {
            $reverse = null;
        }
        try {
            $forecast = self::forecastMeta($lat, $lng);
        } catch (\Throwable $e) {
            $forecast = null;
        }

        $name = (isset($input['name']) && trim((string) $input['name']) !== '')
            ? trim((string) $input['name'])
            : ($reverse['name'] ?? ($reverse['admin1'] !== null ? $reverse['admin1'] . ' area' : null) ?? Geo::formatCoord($lat, $lng));
        $country = (isset($input['country']) && trim((string) $input['country']) !== '')
            ? trim((string) $input['country'])
            : ($reverse['country'] ?? null);
        $countryCode = (isset($input['countryCode']) && trim((string) $input['countryCode']) !== '')
            ? strtoupper(trim((string) $input['countryCode']))
            : ($reverse['countryCode'] ?? null);

        $indicators = [
            self::quakeIndicator($lat, $lng),
            self::heatIndicator($lat, $lng),
            self::airIndicator($lat, $lng),
        ];

        return [
            'location' => [
                'name' => $name,
                'latitude' => Format::num($lat, 4),
                'longitude' => Format::num($lng, 4),
                'country' => $country,
                'countryCode' => $countryCode,
                'admin1' => $reverse['admin1'] ?? null,
                'elevationM' => $forecast['elevation'] ?? null,
                'timezone' => $forecast['timezone'] ?? null,
                'population' => null,
                'localTime' => $forecast['localtime'] ?? null,
            ],
            'indicators' => $indicators,
            'nearbyEvents' => self::nearbyEvents($lat, $lng, 300, 365, 25),
            'disclaimers' => [
                'Indicators are area-level estimates (reanalysis or model grid cells, 25–40 km; seismic catalog within 300 km). They describe the surrounding area, not any specific address or plot.',
                'Country- or region-level hazard data cannot be used to judge street-level safety at this location.',
                'Absence of recorded events is not proof of absence of hazard — reporting completeness varies by region and period.',
            ],
            'generatedAt' => Format::nowIso(),
        ];
    }

    /**
     * Comparison of the selected location against reference cities using the
     * same cached computations (identical methodology across rows).
     *
     * @param array{latitude:float, longitude:float} $input
     */
    public static function compare(array $input): array
    {
        $rows = [];
        $heat = self::heatIndicator((float) $input['latitude'], (float) $input['longitude']);
        $quake = self::quakeIndicator((float) $input['latitude'], (float) $input['longitude']);
        $rows[] = array_merge(
            [
                'name' => 'Selected location',
                'country' => null,
                'latitude' => Format::num((float) $input['latitude'], 3),
                'longitude' => Format::num((float) $input['longitude'], 3),
                'isCurrent' => true,
            ],
            self::heatNums($heat),
            self::quakeNums($quake)
        );

        foreach (self::REFERENCE_LOCATIONS as $ref) {
            $h = self::heatIndicator((float) $ref['lat'], (float) $ref['lng']);
            $q = self::quakeIndicator((float) $ref['lat'], (float) $ref['lng']);
            $rows[] = array_merge(
                [
                    'name' => $ref['name'],
                    'country' => $ref['country'],
                    'latitude' => $ref['lat'],
                    'longitude' => $ref['lng'],
                    'isCurrent' => false,
                ],
                self::heatNums($h),
                self::quakeNums($q)
            );
        }

        return $rows;
    }

    private static function heatNums(array $ind): array
    {
        if ($ind['available'] !== true || !is_array($ind['data'])) {
            return ['hotDaysBaseline' => null, 'hotDaysRecent' => null, 'trendDeltaPct' => null];
        }
        $d = $ind['data'];
        return [
            'hotDaysBaseline' => $d['baselineHotDaysPerYear'] ?? null,
            'hotDaysRecent' => $d['recentHotDaysPerYear'] ?? null,
            'trendDeltaPct' => $d['trendDeltaPct'] ?? null,
        ];
    }

    private static function quakeNums(array $ind): array
    {
        if ($ind['available'] !== true || !is_array($ind['data'])) {
            return ['quakes10y' => null, 'maxMag10y' => null];
        }
        $d = $ind['data'];
        return ['quakes10y' => $d['count10y'] ?? null, 'maxMag10y' => $d['maxMag10y'] ?? null];
    }

    // ------------------------------------------------------------------
    // Reverse geocoding (Nominatim) — throttled + cached
    // ------------------------------------------------------------------

    /**
     * @return array{name:?string, country:?string, countryCode:?string, admin1:?string}
     */
    private static function reverseGeocode(float $lat, float $lng): array
    {
        $key = number_format($lat, 2, '.', '') . ',' . number_format($lng, 2, '.', '');
        $cached = self::reverseCache()->get($key);
        if (is_array($cached)) {
            return $cached;
        }

        // OSMF policy: absolute max 1 req/s — enforce ≥1.1 s spacing.
        $elapsed = microtime(true) - self::$lastNominatimAt;
        if ($elapsed < 1.1 && self::$lastNominatimAt > 0) {
            usleep((int) ((1.1 - $elapsed) * 1_000_000));
        }
        self::$lastNominatimAt = microtime(true);

        $url = sprintf(
            'https://nominatim.openstreetmap.org/reverse?lat=%F&lon=%F&format=jsonv2&zoom=10&addressdetails=1',
            $lat,
            $lng
        );
        $payload = Upstream::getJson($url, ['timeoutMs' => 12000, 'retries' => 2]);

        $addr = isset($payload['address']) && is_array($payload['address']) ? $payload['address'] : [];
        $name = null;
        foreach (['name', 'city', 'town', 'village', 'municipality', 'county'] as $k) {
            if (isset($addr[$k]) && is_string($addr[$k]) && $addr[$k] !== '') {
                $name = $addr[$k];
                break;
            }
        }
        if ($name === null && isset($payload['name']) && is_string($payload['name']) && $payload['name'] !== '') {
            $name = $payload['name'];
        }
        if ($name === null && isset($payload['display_name']) && is_string($payload['display_name'])) {
            $parts = explode(',', $payload['display_name']);
            $name = trim($parts[0]);
        }

        $info = [
            'name' => $name,
            'country' => isset($addr['country']) && is_string($addr['country']) ? $addr['country'] : null,
            'countryCode' => isset($addr['country_code']) && is_string($addr['country_code'])
                ? strtoupper(substr($addr['country_code'], 0, 2))
                : null,
            'admin1' => isset($addr['state']) && is_string($addr['state']) ? $addr['state'] : null,
        ];
        self::reverseCache()->set($key, $info);
        return $info;
    }

    // ------------------------------------------------------------------
    // Forecast meta (timezone, elevation, local time, current temp)
    // ------------------------------------------------------------------

    /**
     * @return array{elevation:?float, timezone:?string, localtime:?string, currentTempC:?float}
     */
    private static function forecastMeta(float $lat, float $lng): array
    {
        $key = number_format($lat, 2, '.', '') . ',' . number_format($lng, 2, '.', '');
        $cached = self::forecastCache()->get($key);
        if (is_array($cached)) {
            return $cached;
        }
        $url = sprintf(
            'https://api.open-meteo.com/v1/forecast?latitude=%F&longitude=%F&current=temperature_2m&timezone=auto&forecast_days=1',
            $lat,
            $lng
        );
        $payload = Upstream::getJson($url, ['timeoutMs' => 12000]);
        $current = isset($payload['current']) && is_array($payload['current']) ? $payload['current'] : [];
        $info = [
            'elevation' => isset($payload['elevation']) && is_numeric($payload['elevation']) ? (float) $payload['elevation'] : null,
            'timezone' => isset($payload['timezone']) && is_string($payload['timezone']) ? $payload['timezone'] : null,
            'localtime' => isset($current['time']) && is_string($current['time']) ? $current['time'] : null,
            'currentTempC' => isset($current['temperature_2m']) && is_numeric($current['temperature_2m']) ? (float) $current['temperature_2m'] : null,
        ];
        self::forecastCache()->set($key, $info);
        return $info;
    }

    // ------------------------------------------------------------------
    // Indicator: earthquake history (USGS FDSN, 300 km / 10 y / M≥4.5)
    // ------------------------------------------------------------------

    private function __construct()
    {
        // static-only service
    }

    private static function quakeIndicator(float $lat, float $lng): array
    {
        $meta = [
            'key' => 'earthquake_history',
            'name' => 'Earthquake history (10-year catalog excerpt)',
            'unavailableReason' => null,
            'source' => self::sourceRef('usgs-earthquakes', 'USGS Earthquake Hazards Program', 'https://earthquake.usgs.gov/'),
            'methodology' => 'USGS FDSN event service query: epicentres within 300 km of the location, magnitude ≥ 4.5, past 10 years, ordered by magnitude. Catalog includes reviewed and preliminary solutions.',
            'limitations' => 'Catalog completeness varies by region and magnitude. Epicentre distance ≠ shaking intensity — local soil and building standards dominate felt impact.',
        ];

        try {
            $cell = number_format($lat, 1, '.', '') . ',' . number_format($lng, 1, '.', '');
            $cached = self::quakeCache()->get($cell);
            if (is_array($cached)) {
                return array_merge($meta, [
                    'available' => true,
                    'valueSummary' => self::quakeSummary($cached),
                    'data' => $cached,
                ]);
            }

            $start = gmdate('Y-m-d', time() - 10 * 365 * 86400);
            $url = sprintf(
                'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=%F&longitude=%F&maxradiuskm=300&starttime=%s&minmagnitude=4.5&orderby=magnitude&limit=1000',
                $lat,
                $lng,
                $start
            );
            $payload = Upstream::getJson($url, ['timeoutMs' => 25000]);
            $features = isset($payload['features']) && is_array($payload['features']) ? $payload['features'] : [];

            $perYear = [];
            $maxMag = null;
            foreach ($features as $f) {
                if (!is_array($f) || !isset($f['properties']['time'], $f['properties']['mag'])) {
                    continue;
                }
                $mag = is_numeric($f['properties']['mag']) ? (float) $f['properties']['mag'] : 0.0;
                $year = (int) gmdate('Y', (int) round(((int) $f['properties']['time']) / 1000));
                if (!isset($perYear[$year])) {
                    $perYear[$year] = ['count' => 0, 'maxMag' => $mag];
                }
                $perYear[$year]['count']++;
                $perYear[$year]['maxMag'] = max($perYear[$year]['maxMag'], $mag);
                $maxMag = $maxMag === null ? $mag : max($maxMag, $mag);
            }
            ksort($perYear);

            $events = [];
            $n = 0;
            foreach ($features as $f) {
                if ($n >= 15) {
                    break;
                }
                if (!is_array($f)) {
                    continue;
                }
                $props = $f['properties'] ?? [];
                $coords = $f['geometry']['coordinates'] ?? null;
                $events[] = [
                    'id' => (string) ($f['id'] ?? ''),
                    'date' => Format::isoFromEpochMs($props['time'] ?? null),
                    'mag' => Format::num($props['mag'] ?? null),
                    'depthKm' => is_array($coords) && isset($coords[2]) ? Format::num($coords[2]) : null,
                    'place' => is_string($props['place'] ?? null) ? $props['place'] : null,
                    'url' => is_string($props['url'] ?? null) ? $props['url'] : null,
                ];
                $n++;
            }

            $perYearOut = [];
            foreach ($perYear as $year => $agg) {
                $perYearOut[] = ['year' => $year, 'count' => $agg['count'], 'maxMag' => Format::num($agg['maxMag'], 1)];
            }

            $data = [
                'count10y' => count($features),
                'maxMag10y' => $maxMag === null ? null : Format::num($maxMag, 1),
                'perYear' => $perYearOut,
                'events' => $events,
            ];
            self::quakeCache()->set($cell, $data);
            return array_merge($meta, ['available' => true, 'valueSummary' => self::quakeSummary($data), 'data' => $data]);
        } catch (\Throwable $e) {
            return array_merge($meta, ['available' => false, 'unavailableReason' => self::reasonOf($e), 'valueSummary' => null, 'data' => null]);
        }
    }

    private static function quakeSummary(array $d): string
    {
        $max = $d['maxMag10y'] ?? null;
        return sprintf(
            '%d events M≥4.5 within 300 km in the past 10 years (max M %s)',
            (int) $d['count10y'],
            $max === null ? '—' : (string) $max
        );
    }

    // ------------------------------------------------------------------
    // Indicator: extreme heat (ERA5 daily Tmax via Open-Meteo archive)
    // ------------------------------------------------------------------

    private static function heatIndicator(float $lat, float $lng): array
    {
        $meta = [
            'key' => 'extreme_heat',
            'name' => 'Extreme heat profile (ERA5, 1995–present)',
            'unavailableReason' => null,
            'source' => self::sourceRef('openmeteo-era5', 'Open-Meteo ERA5 Historical Archive', 'https://open-meteo.com/en/docs/historical-weather-api'),
            'methodology' => 'Daily maximum temperature from the ERA5 reanalysis (~25–31 km grid) via Open-Meteo. Hot-day threshold: 35 °C, auto-lowered to the local 95th-percentile Tmax (ceil) in climates that rarely reach 35 °C. Trend compares the last 5 complete years with the full-period mean. Current year excluded until complete.',
            'limitations' => 'Grid-cell averages — do not capture intra-urban heat-island variation. Reanalysis latency ≈ 5 days.',
        ];

        try {
            $cell = number_format($lat, 1, '.', '') . ',' . number_format($lng, 1, '.', '');
            $cached = self::heatCache()->get($cell);
            if (is_array($cached)) {
                return array_merge($meta, ['available' => true, 'valueSummary' => self::heatSummary($cached), 'data' => $cached]);
            }

            $end = gmdate('Y-m-d', time() - 6 * 86400);
            $url = sprintf(
                'https://archive-api.open-meteo.com/v1/archive?latitude=%F&longitude=%F&start_date=1995-01-01&end_date=%s&daily=temperature_2m_max&timezone=GMT',
                $lat,
                $lng,
                $end
            );
            $payload = Upstream::getJson($url, ['timeoutMs' => 40000, 'maxBytes' => 10485760]);
            $daily = $payload['daily'] ?? null;
            if (!is_array($daily) || !isset($daily['time']) || !is_array($daily['time'])) {
                throw new \RuntimeException('ERA5 series missing daily.time');
            }
            $times = $daily['time'];
            $tmax = isset($daily['temperature_2m_max']) && is_array($daily['temperature_2m_max']) ? $daily['temperature_2m_max'] : [];
            if (count($times) !== count($tmax)) {
                throw new \RuntimeException('ERA5 series length mismatch');
            }

            $currentYear = (int) gmdate('Y');

            // Percentile of all non-null Tmax
            $all = [];
            foreach ($tmax as $v) {
                if (is_numeric($v)) {
                    $all[] = (float) $v;
                }
            }
            if (count($all) < 365) {
                throw new \RuntimeException('ERA5 series too short for this grid cell');
            }
            sort($all);
            $p95 = $all[(int) floor(0.95 * (count($all) - 1))];
            $thresholdC = (int) min(35, ceil($p95));

            $perYear = [];
            $perMonth = array_fill(0, 12, ['sum' => 0.0, 'n' => 0]);
            foreach ($times as $i => $dateStr) {
                $v = $tmax[$i] ?? null;
                if (!is_numeric($v)) {
                    continue;
                }
                $v = (float) $v;
                $ts = strtotime((string) $dateStr . 'T00:00:00+00:00');
                if ($ts === false) {
                    continue;
                }
                $y = (int) gmdate('Y', $ts);
                if ($y >= $currentYear) {
                    continue; // exclude incomplete current year
                }
                if (!isset($perYear[$y])) {
                    $perYear[$y] = ['hotDays' => 0, 'maxTmax' => null];
                }
                if ($v >= $thresholdC) {
                    $perYear[$y]['hotDays']++;
                }
                $perYear[$y]['maxTmax'] = $perYear[$y]['maxTmax'] === null ? $v : max($perYear[$y]['maxTmax'], $v);
                $m = (int) gmdate('n', $ts) - 1;
                $perMonth[$m]['sum'] += $v;
                $perMonth[$m]['n']++;
            }

            $years = array_keys($perYear);
            sort($years);
            if (count($years) < 10) {
                throw new \RuntimeException('Insufficient complete years in ERA5 series');
            }

            $annualSeries = [];
            $sumHot = 0;
            foreach ($years as $y) {
                $agg = $perYear[$y];
                $sumHot += $agg['hotDays'];
                $annualSeries[] = [
                    'year' => $y,
                    'hotDays' => $agg['hotDays'],
                    'maxTmaxC' => $agg['maxTmax'] === null ? null : Format::num($agg['maxTmax'], 1),
                ];
            }
            $baseline = $sumHot / count($years);
            $last5 = array_slice($annualSeries, -5);
            $recent = array_sum(array_column($last5, 'hotDays')) / max(1, count($last5));
            $trendDeltaPct = $baseline >= 0.5 ? Format::num((($recent - $baseline) / $baseline) * 100, 0) : null;

            $monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            $climatology = [];
            foreach ($monthNames as $i => $m) {
                $climatology[] = [
                    'month' => $m,
                    'meanTmaxC' => $perMonth[$i]['n'] > 0 ? Format::num($perMonth[$i]['sum'] / $perMonth[$i]['n'], 1) : 0,
                ];
            }

            $data = [
                'thresholdC' => $thresholdC,
                'baselineHotDaysPerYear' => Format::num($baseline, 1),
                'recentHotDaysPerYear' => Format::num($recent, 1),
                'trendDeltaPct' => $trendDeltaPct,
                'coverageStart' => $years[0],
                'coverageEnd' => $years[count($years) - 1],
                'annualSeries' => $annualSeries,
                'climatology' => $climatology,
            ];
            self::heatCache()->set($cell, $data);
            return array_merge($meta, ['available' => true, 'valueSummary' => self::heatSummary($data), 'data' => $data]);
        } catch (\Throwable $e) {
            return array_merge($meta, ['available' => false, 'unavailableReason' => self::reasonOf($e), 'valueSummary' => null, 'data' => null]);
        }
    }

    private static function heatSummary(array $d): string
    {
        $trend = '';
        if (isset($d['trendDeltaPct']) && is_numeric($d['trendDeltaPct'])) {
            $pct = (float) $d['trendDeltaPct'];
            $trend = sprintf(' — %s%d%% vs baseline', $pct >= 0 ? '+' : '', (int) round($pct));
        }
        return sprintf(
            '%s hot days/yr (Tmax ≥ %s °C) on average %d–%d%s',
            (string) $d['baselineHotDaysPerYear'],
            (string) $d['thresholdC'],
            (int) $d['coverageStart'],
            (int) $d['coverageEnd'],
            $trend
        );
    }

    // ------------------------------------------------------------------
    // Indicator: air quality (CAMS PM2.5 via Open-Meteo)
    // ------------------------------------------------------------------

    private static function airIndicator(float $lat, float $lng): array
    {
        $meta = [
            'key' => 'air_quality',
            'name' => 'Air quality — PM2.5 (CAMS, last 72 h)',
            'unavailableReason' => null,
            'source' => self::sourceRef('openmeteo-cams', 'Open-Meteo Air Quality (CAMS)', 'https://open-meteo.com/en/docs/air-quality-api'),
            'methodology' => 'Copernicus Atmosphere Monitoring Service global composition analysis/forecast via Open-Meteo, sampled at the location. WHO 24-hour guideline: 15 µg/m³.',
            'limitations' => '≈ 40 km model grid — does not resolve street-level gradients or point sources. Model output, not ground measurements.',
        ];

        try {
            $cell = number_format($lat, 1, '.', '') . ',' . number_format($lng, 1, '.', '');
            $cached = self::airCache()->get($cell);
            if (is_array($cached)) {
                return array_merge($meta, ['available' => true, 'valueSummary' => self::airSummary($cached), 'data' => $cached]);
            }

            $url = sprintf(
                'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%F&longitude=%F&hourly=pm2_5&past_days=3&forecast_days=1&timezone=GMT',
                $lat,
                $lng
            );
            $payload = Upstream::getJson($url, ['timeoutMs' => 20000, 'retries' => 5]);
            $hourly = $payload['hourly'] ?? null;
            if (!is_array($hourly) || !isset($hourly['time']) || !is_array($hourly['time'])) {
                throw new \RuntimeException('CAMS response missing hourly.time');
            }
            $times = $hourly['time'];
            $pm = isset($hourly['pm2_5']) && is_array($hourly['pm2_5']) ? $hourly['pm2_5'] : [];

            $hourlyOut = [];
            $vals = [];
            foreach ($times as $i => $t) {
                $v = $pm[$i] ?? null;
                $vNum = is_numeric($v) ? (float) $v : null;
                $hourlyOut[] = ['time' => (string) $t, 'pm25' => $vNum];
                if ($vNum !== null) {
                    $vals[] = $vNum;
                }
            }
            if (count($vals) < 12) {
                throw new \RuntimeException('CAMS series has too few valid hours');
            }

            $last24 = array_slice($vals, -24);
            $mean24 = array_sum($last24) / count($last24);
            $current = $vals[count($vals) - 1];
            $cat = self::pm25Category($mean24);

            $data = [
                'pm25Current' => Format::num($current, 1),
                'pm25Last24hMean' => Format::num($mean24, 1),
                'category' => $cat,
                'hourly' => $hourlyOut,
                'hoursCovered' => count($vals),
            ];
            self::airCache()->set($cell, $data);
            return array_merge($meta, ['available' => true, 'valueSummary' => self::airSummary($data), 'data' => $data]);
        } catch (\Throwable $e) {
            return array_merge($meta, ['available' => false, 'unavailableReason' => self::reasonOf($e), 'valueSummary' => null, 'data' => null]);
        }
    }

    /** @return array{label:string, color:string}|null */
    private static function pm25Category(?float $v): ?array
    {
        if ($v === null) {
            return null;
        }
        $bands = [
            [10, 'Good', '#65a30d'],
            [25, 'Moderate', '#ca8a04'],
            [50, 'Unhealthy (sensitive)', '#ea580c'],
            [100, 'Unhealthy', '#dc2626'],
            [300, 'Very unhealthy', '#991b1b'],
            [PHP_FLOAT_MAX, 'Extreme', '#701a1a'],
        ];
        foreach ($bands as [$max, $label, $color]) {
            if ($v <= $max) {
                return ['label' => $label, 'color' => $color];
            }
        }
        return null;
    }

    private static function airSummary(array $d): string
    {
        $mean = isset($d['pm25Last24hMean']) && $d['pm25Last24hMean'] !== null
            ? $d['pm25Last24hMean'] . ' µg/m³ (24 h mean)'
            : 'no data';
        $cat = isset($d['category']['label']) ? ' — ' . $d['category']['label'] : '';
        return 'PM2.5 ' . $mean . $cat;
    }

    // ------------------------------------------------------------------
    // Nearby events (PostGIS ST_DWithin)
    // ------------------------------------------------------------------

    private static function nearbyEvents(float $lat, float $lng, int $radiusKm, int $days, int $limit): array
    {
        $since = gmdate('Y-m-d\TH:i:s\Z', time() - $days * 86400);
        $sql = 'SELECT *, ST_Distance(geom, ST_MakePoint(:lng, :lat)::geography) AS dist_m
                FROM disaster_event
                WHERE start_date >= :since
                  AND geom IS NOT NULL
                  AND ST_DWithin(geom, ST_MakePoint(:lng2, :lat2)::geography, :radius_m)
                ORDER BY start_date DESC
                LIMIT :lim';
        $rows = Yii::$app->db->createCommand($sql, [
            ':lng' => $lng,
            ':lat' => $lat,
            ':lng2' => $lng,
            ':lat2' => $lat,
            ':since' => $since,
            ':radius_m' => $radiusKm * 1000,
            ':lim' => 600,
        ])->queryAll();

        $events = [];
        foreach ($rows as $row) {
            $dto = Dto::event($row);
            $dto['id'] = (string) $dto['id'];
            $events[] = $dto;
        }
        usort($events, static fn (array $a, array $b): int => strcmp((string) $b['startDate'], (string) $a['startDate']));
        return ['radiusKm' => $radiusKm, 'events' => array_slice($events, 0, $limit)];
    }

    // ------------------------------------------------------------------
    // Shared helpers
    // ------------------------------------------------------------------

    /**
     * Source metadata for indicator citation blocks (from the registry).
     */
    private static function sourceRef(string $key, string $fallbackName, string $fallbackUrl): array
    {
        $ds = (new Query())->from('data_source')->where(['key' => $key])->one();
        $lastRun = (new Query())
            ->select('r.dataset_version')
            ->from(['r' => 'ingestion_run'])
            ->innerJoin(['s' => 'data_source'], 's.id = r.source_id')
            ->where(['s.key' => $key])
            ->andWhere(['r.status' => ['success', 'partial']])
            ->orderBy(['r.started_at' => SORT_DESC])
            ->limit(1)
            ->scalar();

        return [
            'name' => $ds !== null ? (string) $ds['name'] : $fallbackName,
            'provider' => $ds !== null ? (string) $ds['provider'] : $fallbackName,
            'url' => $ds !== null ? (string) $ds['homepage_url'] : $fallbackUrl,
            'licenseName' => $ds !== null ? (string) $ds['license_name'] : 'See provider terms',
            'licenseUrl' => $ds !== null ? (string) $ds['license_url'] : $fallbackUrl,
            'lastSuccessAt' => $ds !== null ? Format::isoFromDateTime($ds['last_success_at']) : null,
            'datasetVersion' => is_string($lastRun) ? $lastRun : null,
        ];
    }

    private static function reasonOf(\Throwable $e): string
    {
        return 'Indicator unavailable: ' . mb_substr($e->getMessage(), 0, 200);
    }

    private static function reverseCache(): TtlCache
    {
        return self::$reverseCache ??= new TtlCache(86400, 1000);
    }

    private static function forecastCache(): TtlCache
    {
        return self::$forecastCache ??= new TtlCache(1800, 1000);
    }

    private static function quakeCache(): TtlCache
    {
        return self::$quakeCache ??= new TtlCache(43200, 300);
    }

    private static function heatCache(): TtlCache
    {
        return self::$heatCache ??= new TtlCache(86400, 200);
    }

    private static function airCache(): TtlCache
    {
        return self::$airCache ??= new TtlCache(1800, 500);
    }
}
