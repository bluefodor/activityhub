import { DEFAULT_FETCH_THROTTLE_MS } from '@/lib/fetchThrottle';

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

export function createSessionCache<T>(defaultTtlMs: number = DEFAULT_FETCH_THROTTLE_MS) {
  const map = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | undefined {
      return map.get(key)?.data;
    },

    set(key: string, data: T) {
      map.set(key, { data, fetchedAt: Date.now() });
    },

    isFresh(key: string, ttlMs: number = defaultTtlMs): boolean {
      const entry = map.get(key);
      if (!entry) return false;
      return Date.now() - entry.fetchedAt < ttlMs;
    },

    delete(key: string) {
      map.delete(key);
    },

    clear() {
      map.clear();
    },
  };
}
