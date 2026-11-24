type CachedEntry = { data: unknown; updatedAt: number };

const entries = new Map<string, CachedEntry>();
const LIMIT = 100;

export function readCacheKey(namespace: string, path: string) {
  return `${namespace}:${path}`;
}

export function getCachedRead<T>(key: string): { data: T; updatedAt: number } | undefined {
  const entry = entries.get(key);
  return entry ? { data: entry.data as T, updatedAt: entry.updatedAt } : undefined;
}

export function setCachedRead(key: string, data: unknown) {
  entries.delete(key);
  entries.set(key, { data, updatedAt: Date.now() });
  if (entries.size > LIMIT) {
    const oldest = entries.keys().next().value;
    if (oldest) entries.delete(oldest);
  }
}

export function clearCachedRead(key: string) {
  entries.delete(key);
}

export function invalidateReadsAfterWrite(path: string, method?: string) {
  if (!method || ["GET", "HEAD"].includes(method.toUpperCase())) return;
  if (/(^|\/)preview(?:\/|$|\?)/.test(path)) return;
  entries.clear();
}
