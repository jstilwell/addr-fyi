import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { site } from '#lib/config/site.js';
import { formatMac, lookupMacWith } from '#lib/server/mac.js';
import { negotiate } from '#lib/server/respond.js';

const TABLE = '/data/oui.tsv';

/** MAC address vendor lookup, e.g. /mac/00:1a:2b:3c:4d:5e or /mac/001a2b. */
export const GET: RequestHandler = async ({ params, fetch, request }) => {
	// In production the table comes straight from the Worker's static assets.
	// Under vite dev the ASSETS binding points at the last build, so a miss
	// falls back to the dev server's copy.
	const fetchTable = async () => {
		const asset = await env.ASSETS?.fetch(new URL(TABLE, site.url));
		return asset?.ok ? asset : fetch(TABLE);
	};
	const result = await lookupMacWith(fetchTable, params.address);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(request, result.info, formatMac(result.info), 200, 'private, max-age=86400');
};
