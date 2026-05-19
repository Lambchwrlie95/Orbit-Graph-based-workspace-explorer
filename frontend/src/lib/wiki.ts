export interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: string;
  url: string;
}

interface CacheEntry {
  fetchedAt: number;
  data: WikiSummary | null;
}

const CACHE_PREFIX = "orbit:wiki:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(query: string): string {
  return `${CACHE_PREFIX}${query.toLowerCase()}`;
}

function readCache(query: string): CacheEntry | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(query));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    const ttl = parsed.data ? TTL_MS : NEGATIVE_TTL_MS;
    if (Date.now() - parsed.fetchedAt > ttl) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(query: string, data: WikiSummary | null) {
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), data };
    window.localStorage.setItem(cacheKey(query), JSON.stringify(entry));
  } catch {
    /* localStorage best-effort */
  }
}

export function invalidateWikiCache(query: string) {
  try {
    window.localStorage.removeItem(cacheKey(query.trim()));
  } catch {
    /* localStorage best-effort */
  }
}

export async function lookupWiki(query: string, signal?: AbortSignal): Promise<WikiSummary | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cached = readCache(trimmed);
  if (cached) return cached.data;

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(trimmed)}?redirect=true`;
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) {
    writeCache(trimmed, null);
    return null;
  }
  if (!res.ok) {
    throw new Error(`Wikipedia API ${res.status}`);
  }

  const json = await res.json();
  if (json.type === "disambiguation") {
    writeCache(trimmed, null);
    return null;
  }

  const summary: WikiSummary = {
    title: json.title ?? trimmed,
    extract: json.extract ?? "",
    thumbnail: json.thumbnail?.source,
    url: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(trimmed)}`,
  };
  writeCache(trimmed, summary);
  return summary;
}
