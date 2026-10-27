import { env, waitUntil } from 'cloudflare:workers';
import { dev } from '$app/env';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { site } from '#lib/config/site.js';
import { negotiate } from '#lib/server/respond.js';
import { responseCache } from '#lib/server/response-cache.js';

/** Routes that call an upstream or open outbound connections (ip-api, RDAP, DoH,
 * Open-Meteo, RIPEstat, CT logs, /http and /port probes). */
const LIMITED_ROUTE = /^\/(find|vpn|whois|dns|weather|mail|bgp|certs|http|port)(\/|$)/;

const acceptsHtml = (request: Request): boolean =>
	(request.headers.get('accept') ?? '').includes('text/html');

/**
 * The scheme the visitor used, as reported by Cloudflare's edge. The Worker
 * itself always sees http://, so request.url can't answer this. Null when the
 * header is absent (local dev).
 */
const visitorScheme = (request: Request): string | null => {
	try {
		return JSON.parse(request.headers.get('cf-visitor') ?? '').scheme ?? null;
	} catch {
		return null;
	}
};

const rateLimited = async ({ getClientAddress }: RequestEvent): Promise<boolean> => {
	const limiter = env.LOOKUP_LIMITER;
	if (!limiter) return false;
	try {
		const { success } = await limiter.limit({ key: getClientAddress() });
		return !success;
	} catch {
		// Fail open: a limiter hiccup shouldn't take the lookups down with it.
		return false;
	}
};

const route = async (event: RequestEvent, resolve: Parameters<Handle>[0]['resolve']) => {
	const { request, url } = event;

	// Browsers get upgraded to HTTPS; everything else keeps working over plain
	// http:// so `curl addr.fyi` needs no -L.
	if (
		visitorScheme(request) === 'http' &&
		(request.method === 'GET' || request.method === 'HEAD') &&
		acceptsHtml(request)
	) {
		return new Response(null, {
			status: 301,
			headers: { Location: site.url + url.pathname + url.search }
		});
	}

	if (LIMITED_ROUTE.test(url.pathname) && (await rateLimited(event))) {
		const error = 'rate limit exceeded — slow down and try again in a minute';
		const response = negotiate(request, { error }, `Error: ${error}\n`, 429);
		response.headers.set('Retry-After', '60');
		return response;
	}

	const response = await resolve(event);

	// Unknown paths render SvelteKit's HTML error page; curl and JSON clients
	// get a one-line error in the format they asked for instead.
	if (
		response.status === 404 &&
		!acceptsHtml(request) &&
		(response.headers.get('content-type') ?? '').startsWith('text/html')
	) {
		return negotiate(request, { error: 'not found' }, 'Error: not found\n', 404);
	}

	return response;
};

const app: Handle = async ({ event, resolve }) => {
	const response = await route(event, resolve);

	response.headers.set('X-Addr-Version', site.version);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
	);
	// Only meaningful (and only honored by browsers) over HTTPS. curl ignores
	// HSTS unless asked, so plaintext http:// keeps working.
	if (visitorScheme(event.request) === 'https') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000');
	}

	return response;
};

// The edge cache is outermost, so stored responses already carry the headers above.
export const handle = sequence(responseCache({ waitUntil, enabled: !dev }), app);
