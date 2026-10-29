<?php

namespace api\modules\v1\support;

use yii\httpclient\Client;

/**
 * SSRF-hardened outbound HTTP client for ingestion and on-demand upstream
 * queries. Mirrors the guarantees of the sandbox client (src/lib/fetch-safe.ts):
 *
 *  1. HTTPS only.
 *  2. Host allow-list — only hosts from the documented data-source registry
 *     may be contacted; raw user URLs are never fetched.
 *  3. Bounded timeout (20 s default), 3 retries with jittered exponential
 *     backoff, bounded payload size (25 MB default).
 *  4. Identifiable User-Agent ("WorldRiskAtlas/0.1", overridable via the
 *     APP_USER_AGENT environment variable — Nominatim policy requires a real
 *     identifying UA).
 *  5. IPv4-first DNS resolution (CURLOPT_IPRESOLVE_V4) — see the note in
 *     common/bootstrap.php; several upstreams advertise unreachable AAAA
 *     records in some networks.
 *
 * Non-429 4xx responses are NOT retried; transport errors, 429 and 5xx are.
 *
 * UpstreamException is defined here (it is always thrown from this file, so
 * it is guaranteed to be loaded when caught); external callers catch
 * \Throwable instead.
 */
final class Upstream
{
    public const USER_AGENT = 'WorldRiskAtlas/0.1';
    public const DEFAULT_TIMEOUT_MS = 20000;
    public const DEFAULT_RETRIES = 3;
    public const DEFAULT_RETRY_DELAY_MS = 600;
    public const DEFAULT_MAX_BYTES = 26214400; // 25 MB

    private const ALLOWED_HOSTS = [
        'earthquake.usgs.gov',
        'eonet.gsfc.nasa.gov',
        'api.open-meteo.com',
        'geocoding-api.open-meteo.com',
        'archive-api.open-meteo.com',
        'air-quality-api.open-meteo.com',
        'nominatim.openstreetmap.org',
        'api.reliefweb.int',
        'firms.modaps.eosdis.nasa.gov',
    ];

    /**
     * Performs a GET request against an allow-listed upstream and returns the
     * decoded JSON payload as an array.
     *
     * Supported options: timeoutMs (int), retries (int), retryDelayMs (int),
     * maxBytes (int).
     *
     * @throws UpstreamException on any failure after exhausting retries.
     */
    public static function getJson(string $rawUrl, array $opts = []): array
    {
        $timeoutMs = isset($opts['timeoutMs']) ? max(1000, (int) $opts['timeoutMs']) : self::DEFAULT_TIMEOUT_MS;
        $retries = isset($opts['retries']) ? max(0, (int) $opts['retries']) : self::DEFAULT_RETRIES;
        $retryDelayMs = isset($opts['retryDelayMs']) ? max(0, (int) $opts['retryDelayMs']) : self::DEFAULT_RETRY_DELAY_MS;
        $maxBytes = isset($opts['maxBytes']) ? max(1024, (int) $opts['maxBytes']) : self::DEFAULT_MAX_BYTES;

        $url = self::assertAllowedUrl($rawUrl);
        $host = (string) parse_url($url, PHP_URL_HOST);

        $attempts = $retries + 1;
        $lastException = null;

        for ($attempt = 1; $attempt <= $attempts; $attempt++) {
            if ($attempt > 1) {
                // Jittered exponential backoff: 600ms, 1200ms, 2400ms ... +0..300ms.
                $delayMs = $retryDelayMs * (2 ** ($attempt - 2)) + random_int(0, 300);
                usleep($delayMs * 1000);
            }
            try {
                return self::performJsonGet($url, $host, $timeoutMs, $maxBytes);
            } catch (UpstreamException $e) {
                $lastException = $e;
                // 4xx (except 429) will not get better by retrying.
                if ($e->statusCode >= 400 && $e->statusCode < 500 && $e->statusCode !== 429) {
                    throw $e;
                }
            }
        }

        throw $lastException ?? new UpstreamException("Upstream {$host} failed", 0, $host);
    }

    private static function performJsonGet(string $url, string $host, int $timeoutMs, int $maxBytes): array
    {
        $client = new Client([
            'transport' => extension_loaded('curl')
                ? 'yii\httpclient\CurlTransport'
                : 'yii\httpclient\StreamTransport',
        ]);

        $request = $client->createRequest()
            ->setMethod('GET')
            ->setUrl($url)
            ->setHeaders([
                'User-Agent' => self::userAgent(),
                'Accept' => 'application/json',
            ])
            ->setOptions(self::transportOptions($timeoutMs));

        try {
            $response = $request->send();
        } catch (\Throwable $e) {
            throw new UpstreamException(
                "Upstream {$host} transport error: " . Format::limit($e->getMessage(), 200),
                0,
                $host
            );
        }

        if (!$response->getIsOk()) {
            $status = (int) $response->getStatusCode();
            throw new UpstreamException("Upstream {$host} responded HTTP {$status}", $status, $host);
        }

        $contentLength = $response->headers->get('Content-Length');
        if ($contentLength !== null && (int) $contentLength > $maxBytes) {
            throw new UpstreamException("Upstream payload too large ({$contentLength} bytes)", 0, $host);
        }

        $content = (string) $response->getContent();
        if (strlen($content) > $maxBytes) {
            throw new UpstreamException('Upstream payload too large (> ' . $maxBytes . ' bytes)', 0, $host);
        }

        try {
            $decoded = json_decode($content, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new UpstreamException(
                "Upstream {$host} returned invalid JSON: " . Format::limit($e->getMessage(), 150),
                0,
                $host
            );
        }

        if (!is_array($decoded)) {
            throw new UpstreamException("Upstream {$host} returned a non-object JSON document", 0, $host);
        }

        return $decoded;
    }

    private static function transportOptions(int $timeoutMs): array
    {
        $seconds = max(1, (int) ceil($timeoutMs / 1000));
        if (extension_loaded('curl')) {
            $options = [
                CURLOPT_TIMEOUT => $seconds,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
            ];
            if (defined('CURLOPT_IPRESOLVE') && defined('CURL_IPRESOLVE_V4')) {
                // IPv4-first resolution — see common/bootstrap.php.
                $options[CURLOPT_IPRESOLVE] = CURL_IPRESOLVE_V4;
            }
            return $options;
        }
        // StreamTransport fallback.
        return [
            'timeout' => $seconds,
            'follow_location' => 1,
            'max_redirects' => 3,
        ];
    }

    public static function userAgent(): string
    {
        $override = getenv('APP_USER_AGENT');
        if ($override !== false && trim($override) !== '') {
            return trim($override);
        }
        return self::USER_AGENT;
    }

    /**
     * @throws UpstreamException when the URL is not HTTPS or the host is not
     *                           in the allow-list.
     */
    public static function assertAllowedUrl(string $rawUrl): string
    {
        $parts = parse_url($rawUrl);
        if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
            throw new UpstreamException('Invalid upstream URL: ' . Format::limit($rawUrl, 200));
        }
        if ($parts['scheme'] !== 'https') {
            throw new UpstreamException('Blocked non-HTTPS upstream URL: ' . $parts['scheme']);
        }
        $host = strtolower($parts['host']);
        if (!in_array($host, self::ALLOWED_HOSTS, true)) {
            throw new UpstreamException(
                'Blocked upstream host not in the data-source allow-list: ' . $host,
                0,
                $host
            );
        }
        return $rawUrl;
    }
}

/**
 * @property int $statusCode HTTP status (0 for transport/parse failures)
 * @property string $host
 */
class UpstreamException extends \RuntimeException
{
    /** @var int */
    public $statusCode = 0;
    /** @var string */
    public $host = '';

    public function __construct(string $message, int $statusCode = 0, string $host = '')
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
        $this->host = $host;
    }
}
