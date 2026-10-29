// Minimal in-process TTL cache (the sandbox stack prescribes local memory
// caching — no Redis/MySQL middleware). Swap for a distributed cache in
// production without changing call sites.

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(
    private ttlMs: number,
    private maxEntries = 500,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      // evict soonest-expiring entries first
      const keys = [...this.store.keys()].slice(0, Math.ceil(this.maxEntries / 4));
      for (const k of keys) this.store.delete(k);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  async wrap(key: string, producer: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await producer();
    this.set(key, value);
    return value;
  }
}
