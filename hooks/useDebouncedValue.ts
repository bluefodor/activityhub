import { useState, useEffect } from 'react';

/**
 * Returns a version of `value` that only updates after `delayMs` ms of
 * stability.  Use to debounce rapid activity-switch events so data hooks
 * don't fire a fetch for every intermediate carousel position.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
