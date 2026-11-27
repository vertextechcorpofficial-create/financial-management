/* A short lived cache for reads that change far less often than they are read.
 *
 * Measured cost in this module is round trips, not rows, so the four reference lists and the
 * register status totals are remembered briefly and dropped explicitly by the screens that
 * write them. Times stay short on purpose: a stale minute is fine, a stale hour is not.
 */

interface MemoEntry {
  at: number;
  value: unknown;
}

const store = new Map<string, MemoEntry>();

export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  store.set(key, { at: now, value });
  if (store.size > 200) {
    for (const [k, entry] of store) if (now - entry.at > ttlMs) store.delete(k);
  }
  return value;
}

/** Anything that changes a remembered read calls this with its key prefix. */
export function forget(prefix: string): void {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}
