<?php

namespace api\modules\v1\support;

/**
 * Geographic helpers shared by the API controllers.
 */
final class Geo
{
    /**
     * Parses a "west,south,east,north" bounding-box string.
     * Returns null when the string is absent or invalid.
     *
     * @return array{west: float, south: float, east: float, north: float}|null
     */
    public static function parseBbox(?string $raw): ?array
    {
        if ($raw === null) {
            return null;
        }
        $parts = explode(',', $raw);
        if (count($parts) !== 4) {
            return null;
        }
        $nums = [];
        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '' || !is_numeric($part)) {
                return null;
            }
            $nums[] = (float) $part;
        }
        list($west, $south, $east, $north) = $nums;
        if (abs($west) > 180 || abs($east) > 180 || abs($south) > 90 || abs($north) > 90) {
            return null;
        }
        if ($south > $north) {
            return null;
        }
        return ['west' => $west, 'south' => $south, 'east' => $east, 'north' => $north];
    }

    /** "51.507°N, 0.128°W" — display fallback for unnamed locations. */
    public static function formatCoord(float $lat, float $lng, int $digits = 3): string
    {
        $ns = $lat >= 0 ? 'N' : 'S';
        $ew = $lng >= 0 ? 'E' : 'W';
        return sprintf("%.{$digits}f°%s, %.{$digits}f°%s", abs($lat), $ns, abs($lng), $ew);
    }
}
