import type { RequestHandler } from './$types';
import { formatBgp, lookupBgp } from '#lib/server/bgp.js';
import { negotiate } from '#lib/server/respond.js';

/** BGP routing info via RIPEstat: /bgp/8.8.8.8, /bgp/1.1.1.0/24, /bgp/AS13335. */
export const GET: RequestHandler = async ({ params, fetch, request }) => {
	const result = await lookupBgp(fetch, params.query);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(
		request,
		result.routing,
		formatBgp(result.routing),
		200,
		'private, max-age=3600'
	);
};
