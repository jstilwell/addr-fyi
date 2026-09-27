/**
 * Edge cache helpers for upstream data. Entries live in caches.default under
 * synthetic https://cache.addr.fyi/... keys (never fetched) — see CLAUDE.md on
 * why shared data is cached here rather than with public Cache-Control.
 */

export const cacheKey = (path: string) => new Request(`https://cache.addr.fyi/${path}`);

/** Read a cached JSON value; any cache failure is treated as a miss. */
export const readCachedJson = async <T>(
	platform: App.Platform | undefined,
	key: Request
): Promise<T | null> => {
	const cache = platform?.caches?.default;
	if (!cache) return null;
	try {
		const hit = await cache.match(key);
		return hit ? ((await hit.json()) as T) : null;
	} catch {
		return null;
	}
};

/** Store a JSON value for `ttl` seconds without delaying the response. */
export const cacheJson = (
	platform: App.Platform | undefined,
	key: Request,
	body: unknown,
	ttl: number
) => {
	const cache = platform?.caches?.default;
	if (!cache || !platform) return;
	platform.ctx.waitUntil(
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
