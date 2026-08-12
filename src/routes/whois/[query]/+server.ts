import type { RequestHandler } from './$types';
import { formatWhois, lookupWhois } from '$lib/server/rdap';
import { negotiate } from '$lib/server/respond';

/** WHOIS via RDAP: accepts an IP, a domain, or an ASN (e.g. AS13335). */
export const GET: RequestHandler = async ({ params, fetch, request, platform }) => {
	const result = await lookupWhois(params.query, fetch, platform);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(
		request,
		result.summary,
		formatWhois(result.summary),
		200,
		'public, max-age=3600'
	);
};
