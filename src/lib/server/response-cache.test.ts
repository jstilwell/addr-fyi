import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { responseCache } from './response-cache.js';

// A minimal stand-in for the Workers Cache API, keyed by URL like the real one
// (it only ever matches GET).
class FakeCache {
	store = new Map<string, Response>();
	async match(request: Request) {
		if (request.method !== 'GET') return undefined;
		return this.store.get(request.url)?.clone();
	}
	async put(request: Request, response: Response) {
		this.store.set(request.url, response);
	}
}

let cache: FakeCache;
let pending: Promise<unknown>[];
const waitUntil = (promise: Promise<unknown>) => void pending.push(promise);

beforeEach(() => {
	cache = new FakeCache();
	pending = [];
	vi.stubGlobal('caches', { default: cache });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function call(request: Request, response: () => Response, options = {}) {
	const resolve = vi.fn(async () => response());
	const handle = responseCache({ waitUntil, ...options });
	const result = handle({ event: { request } as RequestEvent, resolve });
	return { result, resolve };
}

const page =
	(cacheControl?: string, status = 200, extra: Record<string, string> = {}) =>
	() =>
		new Response('rendered', {
			status,
			headers: { ...(cacheControl ? { 'cache-control': cacheControl } : {}), ...extra }
		});

describe('responseCache', () => {
	it('stores a public GET response and serves the next request from cache', async () => {
		const first = call(new Request('https://example.com/'), page('public, max-age=60'));
		expect(await (await first.result).text()).toBe('rendered');
		await Promise.all(pending);

		const second = call(new Request('https://example.com/'), page('public, max-age=60'));
		expect(await (await second.result).text()).toBe('rendered');
		expect(second.resolve).not.toHaveBeenCalled();
	});

	it('answers HEAD from the stored GET, without a body', async () => {
		await call(new Request('https://example.com/'), page('public, max-age=60')).result;
		await Promise.all(pending);

		const head = call(new Request('https://example.com/', { method: 'HEAD' }), page());
		const response = await head.result;
		expect(head.resolve).not.toHaveBeenCalled();
		expect(response.body).toBeNull();
	});

	it.each([
		['no Cache-Control', undefined],
		['private', 'private, max-age=60'],
		['no-store', 'no-store'],
		['no-cache', 'public, no-cache']
	])('does not store a response with %s', async (_, cacheControl) => {
		await call(new Request('https://example.com/'), page(cacheControl)).result;
		expect(pending).toHaveLength(0);
		expect(cache.store.size).toBe(0);
	});

	it('does not store error, redirect-other or Vary: * responses', async () => {
		await call(new Request('https://example.com/a'), page('public, max-age=60', 404)).result;
		await call(new Request('https://example.com/b'), page('public, max-age=60', 302)).result;
		await call(new Request('https://example.com/c'), page('public, max-age=60', 200, { vary: '*' }))
			.result;
		expect(cache.store.size).toBe(0);
	});

	it('marks Set-Cookie private so the cookie is not cached', async () => {
		const response = await call(
			new Request('https://example.com/'),
			page('public, max-age=60', 200, { 'set-cookie': 'a=1' })
		).result;
		expect(response.headers.get('cache-control')).toBe('public, max-age=60, private=Set-Cookie');
		await Promise.all(pending);
		expect(cache.store.size).toBe(1);
	});

	it('skips the lookup when the request says no-cache', async () => {
		await call(new Request('https://example.com/'), page('public, max-age=60')).result;
		await Promise.all(pending);

		const fresh = call(
			new Request('https://example.com/', { headers: { 'cache-control': 'no-cache' } }),
			page('public, max-age=60')
		);
		await fresh.result;
		expect(fresh.resolve).toHaveBeenCalled();
	});

	it('leaves POST requests and disabled or cache-less runs alone', async () => {
		await call(new Request('https://example.com/', { method: 'POST' }), page('public, max-age=60'))
			.result;
		await call(new Request('https://example.com/'), page('public, max-age=60'), { enabled: false })
			.result;
		vi.unstubAllGlobals();
		await call(new Request('https://example.com/'), page('public, max-age=60')).result;
		expect(cache.store.size).toBe(0);
	});
});
