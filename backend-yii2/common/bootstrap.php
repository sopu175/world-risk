<?php
/**
 * WorldRisk Atlas — common environment bootstrap.
 *
 * This file is required FIRST by both entry scripts (web/index.php and ./yii)
 * before any configuration is loaded, so that .env values are visible to the
 * config files and to every component that reads getenv().
 *
 * Contents:
 *  1. A zero-dependency, Dotenv-style .env parser (putenv/getenv based — no
 *     vlucas/phpdotenv instantiation needed at runtime; the package is still
 *     composer-required so deployers may swap it in if preferred).
 *  2. A note on IPv4-first DNS resolution for upstream API hosts (mirrored in
 *     the HTTP client via CURLOPT_IPRESOLVE = CURL_IPRESOLVE_V4).
 *  3. A small env() helper used by config/*.php.
 */

// ---------------------------------------------------------------------------
// 1. .env loader — simple, deterministic, never overrides a real env variable.
// ---------------------------------------------------------------------------
if (!function_exists('wra_load_env_file')) {
    /**
     * Parses a .env file and registers each KEY=VALUE pair into the process
     * environment (putenv + $_ENV + $_SERVER). Lines starting with `#` are
     * comments; an optional `export ` prefix is tolerated; values may be
     * single- or double-quoted; existing environment variables always win.
     */
    function wra_load_env_file(string $path): void
    {
        if (!is_file($path) || !is_readable($path)) {
            return;
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            if (strpos($line, 'export ') === 0) {
                $line = trim(substr($line, 7));
            }
            $eq = strpos($line, '=');
            if ($eq === false) {
                continue;
            }
            $key = trim(substr($line, 0, $eq));
            $value = trim(substr($line, $eq + 1));
            if ($key === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_.]*$/', $key)) {
                continue;
            }
            $len = strlen($value);
            if ($len >= 2) {
                $first = $value[0];
                $last = $value[$len - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                    if ($first === '"') {
                        $value = str_replace(['\\n', '\\r', '\\"', '\\\\'], ["\n", "\r", '"', '\\'], $value);
                    }
                }
            }
            if (getenv($key) !== false) {
                continue; // real environment takes precedence over .env
            }
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
}

wra_load_env_file(dirname(__DIR__) . '/.env');

// ---------------------------------------------------------------------------
// 2. DNS / IPv4 note.
// ---------------------------------------------------------------------------
// The sandbox client (src/lib/fetch-safe.ts) forces IPv4-first DNS resolution
// (`dns.setDefaultResultOrder("ipv4first")`) because several upstream hosts in
// the allow-list (USGS, NASA, Open-Meteo edges) advertise AAAA records that
// are unreachable from some networks, producing spurious "fetch failed" /
// ETIMEDOUT errors. The PHP stack mirrors this in
// api/modules/v1/support/Upstream.php by pinning
//   CURLOPT_IPRESOLVE = CURL_IPRESOLVE_V4
// on every request when the cURL transport is available. On bare-metal hosts
// it is also worth configuring systemd-resolved / nginx with IPv4-first or
// single-stack resolution for these upstreams.

// ---------------------------------------------------------------------------
// 3. Helpers used by config files.
// ---------------------------------------------------------------------------
if (!function_exists('wra_env')) {
    /**
     * Reads an environment variable (set via .env or the real environment).
     * Returns $default when the variable is unset or blank.
     */
    function wra_env(string $key, $default = null)
    {
        $value = getenv($key);
        if ($value === false || trim($value) === '') {
            return $default;
        }
        return trim($value);
    }
}

// All stored and emitted timestamps are UTC.
if (function_exists('date_default_timezone_set')) {
    date_default_timezone_set('UTC');
}
