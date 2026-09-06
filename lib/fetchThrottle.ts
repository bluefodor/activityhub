const lastFetchedAt = new Map<string, number>();

export const DEFAULT_FETCH_THROTTLE_MS = 60_000;

export function isFetchThrottled(
  key: string,
  ttlMs: number = DEFAULT_FETCH_THROTTLE_MS,
  force?: boolean
): boolean {
  if (force) return false;
  const last = lastFetchedAt.get(key) ?? 0;
  return Date.now() - last < ttlMs;
}

export function markFetchCompleted(key: string) {
  lastFetchedAt.set(key, Date.now());
}

export function clearFetchThrottle(key?: string) {
  if (key) {
    lastFetchedAt.delete(key);
  } else {
    lastFetchedAt.clear();
  }
}
