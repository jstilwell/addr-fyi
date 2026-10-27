import type { RequestHandler } from './$types';
import { dohQuery } from '#lib/server/dns.js';
import { checkHttp, formatHttp } from '#lib/server/http-check.js';
import { negotiate } from '#lib/server/respond.js';

// The path is someone else's URL: a trailing slash belongs to it, so don't
// let SvelteKit 308-redirect it away (curl doesn't follow redirects by default).
export const trailingSlash = 'ignore';

/**
 * HTTP check from the edge: /http/example.com, /http/http://example.com/path?q=1.
 * The target's own query string rides along on ours. Uses the global fetch,
 * not SvelteKit's, so no request is ever routed back into this app.
 */
export const GET: RequestHandler = async ({ params, url, request }) => {
	const result = await checkHttp(
		globalThis.fetch,
		(name, type) => dohQuery(globalThis.fetch, name, type),
		params.target + url.search
	);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(request, result.report, formatHttp(result.report));
};
