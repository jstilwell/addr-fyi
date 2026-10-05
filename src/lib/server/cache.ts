/**
 * Edge cache helpers for upstream data. Entries live in caches.default under
 * synthetic https://cache.addr.fyi/... keys (never fetched) — see CLAUDE.md on
 * why shared data is cached here rather than with public Cache-Control.
 */
import { waitUntil } from 'cloudflare:workers';

export const cacheKey = (path: string) => new Request(`https://cache.addr.fyi/${path}`);

/**
 * Workers' default cache is a global; plain Node (e.g. tests) has no `caches`.
 * The DOM lib's CacheStorage type has no `default`, hence the cast.
 */
const edgeCache = (): Cache | undefined =>
	typeof caches === 'undefined' ? undefined : (caches as CacheStorage & { default: Cache }).default;

/** Read a cached JSON value; any cache failure is treated as a miss. */
export const readCachedJson = async <T>(key: Request): Promise<T | null> => {
	const cache = edgeCache();
	if (!cache) return null;
	try {
		const hit = await cache.match(key);
		return hit ? ((await hit.json()) as T) : null;
	} catch {
		return null;
	}
};

/** Store a JSON value for `ttl` seconds without delaying the response. */
export const cacheJson = (key: Request, body: unknown, ttl: number) => {
	const cache = edgeCache();
	if (!cache) return;
	waitUntil(
		cache.put(
			key,
			new Response(JSON.stringify(body), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': `public, max-age=${ttl}`
				}
			})
		)
	);
};
