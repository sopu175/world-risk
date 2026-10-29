<?php

namespace api\modules\v1\support;

/**
 * Formatting helpers shared by API controllers, services and ingest adapters.
 *
 * All datetimes on the wire are ISO-8601 UTC strings ("...Z") or null —
 * the same convention the Next.js sandbox client uses.
 */
final class Format
{
    /**
     * Converts anything date-like (DateTimeInterface, epoch seconds as
     * numeric, or a parseable string — including PostgreSQL timestamptz text)
     * into an ISO-8601 UTC string. Returns null when unparseable.
     */
    public static function isoFromDateTime($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
        }
        if (is_int($value) || (is_string($value) && preg_match('/^\d+$/', $value) === 1)) {
            return self::isoFromEpoch((int) $value);
        }
        if (!is_string($value)) {
            return null;
        }
        try {
            $dt = new \DateTimeImmutable($value);
        } catch (\Exception $e) {
            return null;
        }
        return $dt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    public static function isoFromEpoch(int $seconds): string
    {
        return gmdate('Y-m-d\TH:i:s\Z', $seconds);
    }

    /**
     * Epoch milliseconds (USGS feed convention) → ISO-8601 UTC with
     * millisecond precision, or null when the input is not numeric.
     */
    public static function isoFromEpochMs($ms): ?string
    {
        if ($ms === null || !is_numeric($ms)) {
            return null;
        }
        $msInt = (int) round((float) $ms);
        $seconds = intdiv($msInt, 1000);
        $millis = abs($msInt % 1000);
        return gmdate('Y-m-d\TH:i:s', $seconds) . '.' . sprintf('%03d', $millis) . 'Z';
    }

    /**
     * Parses a date-like value into epoch milliseconds (USGS dedup compares
     * occurred_at as epoch ms). Returns null when unparseable.
     */
    public static function epochMsFromDateTime($value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            return (int) $value->format('Uv');
        }
        if (!is_string($value)) {
            return null;
        }
        try {
            $dt = new \DateTimeImmutable($value);
        } catch (\Exception $e) {
            return null;
        }
        return (int) $dt->format('Uv');
    }

    public static function nowIso(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }

    /**
     * Normalises a numeric value for JSON output: null-safe, finite-safe, and
     * converts integral floats to ints so e.g. 3.0 serialises as 3 — matching
     * JavaScript Math.round semantics used by the sandbox contract.
     */
    public static function num($value, ?int $digits = null)
    {
        if ($value === null || is_bool($value) || !is_numeric($value)) {
            return null;
        }
        $f = (float) $value;
        if (!is_finite($f)) {
            return null;
        }
        if ($digits !== null) {
            $f = round($f, $digits);
        }
        if (abs($f) < 1.0e15 && $f === (float) (int) $f) {
            return (int) $f;
        }
        return $f;
    }

    /** Multibyte-safe truncation (falls back to substr without ext-mbstring). */
    public static function limit(string $value, int $max): string
    {
        if ($max <= 0) {
            return '';
        }
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $max);
        }
        return substr($value, 0, $max);
    }

    public static function lower(string $value): string
    {
        if (function_exists('mb_strtolower')) {
            return mb_strtolower($value);
        }
        return strtolower($value);
    }
}
