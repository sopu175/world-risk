<?php

namespace api\modules\v1\support;

/**
 * Minimal in-process TTL cache used by the location services (reverse
 * geocoding, quake history, ERA5 heat profile, PM2.5 series).
 *
 * The sandbox MVP uses per-process memory caching; in a multi-node production
 * deployment swap this class for Redis/memcached without changing call sites.
 */
final class TtlCache
{
    /** @var array<string, array{value:mixed, expires_at:int}> */
    private array $store = [];
    private int $ttlSeconds;
    private int $maxEntries;

    public function __construct(int $ttlSeconds, int $maxEntries = 500)
    {
        $this->ttlSeconds = max(1, $ttlSeconds);
        $this->maxEntries = max(1, $maxEntries);
    }

    /**
     * @return mixed|null the cached value, or null on miss/expiry.
     *                     Note: callers never cache null values.
     */
    public function get(string $key)
    {
        if (!array_key_exists($key, $this->store)) {
            return null;
        }
        $entry = $this->store[$key];
        if (!is_array($entry) || !isset($entry['expires_at']) || time() >= $entry['expires_at']) {
            unset($this->store[$key]);
            return null;
        }
        return $entry['value'];
    }

    /**
     * @param mixed $value (never null in this codebase)
     */
    public function set(string $key, $value): void
    {
        if (count($this->store) >= $this->maxEntries) {
            // Evict roughly a quarter of entries (oldest insertion order).
            $evict = (int) ceil($this->maxEntries / 4);
            $keys = array_keys($this->store);
            $total = count($keys);
            for ($i = 0; $i < $evict && $i < $total; $i++) {
                unset($this->store[$keys[$i]]);
            }
        }
        $this->store[$key] = [
            'value' => $value,
            'expires_at' => time() + $this->ttlSeconds,
        ];
    }
}
