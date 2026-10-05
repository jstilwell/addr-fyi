import type { Handle } from '@sveltejs/kit/hooks';

// Edge cache for rendered responses, in the Workers Cache API (`caches.default`).
//
// adapter-cloudflare 7 wrapped every request in this layer; adapter 8 dropped it,
// so this hook restores the same rules:
// - GET and HEAD are looked up first (HEAD is answered from the stored GET). A
//   request with `Cache-Control: no-cache` skips the lookup.
// - A GET response is stored when it has a Cache-Control header without
//   private/no-cache/no-store, a cacheable status (200, 203, 204, 300, 301) and
//   no `Vary: *`. How long it lives comes from that header (s-maxage over max-age).
// - A response with Set-Cookie is stored with `private=Set-Cookie`, so the cookie
//   is never replayed from cache.
// The cache is per data center and is cleared by a zone purge.

const CACHEABLE_STATUS = new Set([200, 203, 204, 300, 301]);

function isCacheable(response: Response): boolean {
	const cacheControl = response.headers.get('cache-control') ?? '';
	return (
		cacheControl !== '' &&
		CACHEABLE_STATUS.has(response.status) &&
		!(response.headers.get('vary') ?? '').includes('*') &&
		!/private|no-cache|no-store/i.test(cacheControl)
	);
}

export function responseCache({
	waitUntil,
	enabled = true
}: {
	waitUntil: (promise: Promise<unknown>) => void;
	enabled?: boolean;
}): Handle {
	return async ({ event, resolve }) => {
		const { request } = event;
		// `caches` is a Workers global; it's missing in Node (builds, prerendering).
		const cache =
			typeof caches === 'undefined' ? undefined : (caches as { default?: Cache }).default;
		if (!enabled || !cache || (request.method !== 'GET' && request.method !== 'HEAD')) {
			return resolve(event);
		}

		const key = request.method === 'HEAD' ? new Request(request, { method: 'GET' }) : request;

		if (!(request.headers.get('cache-control') ?? '').includes('no-cache')) {
			const hit = await cache.match(key);
			// Copy so later hooks and SvelteKit can still set headers on it.
			if (hit) return new Response(request.method === 'HEAD' ? null : hit.body, hit);
		}

		let response = await resolve(event);
		if (request.method === 'GET' && isCacheable(response)) {
			if (response.headers.has('set-cookie')) {
				response = new Response(response.body, response);
				response.headers.append('cache-control', 'private=Set-Cookie');
			}
			waitUntil(cache.put(key, response.clone()));
		}
		return response;
	};
}
