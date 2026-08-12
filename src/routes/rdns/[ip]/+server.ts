import type { RequestHandler } from './$types';
import { ptrLookup } from '$lib/server/dns';
import { negotiate } from '$lib/server/respond';

/** Reverse DNS (PTR) lookup for an IPv4 or IPv6 address via DNS-over-HTTPS. */
export const GET: RequestHandler = async ({ params, fetch, request }) => {
	const result = await ptrLookup(fetch, params.ip);
	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	const plaintext =
		result.hostnames.length === 0
			? `No PTR record for ${params.ip}\n`
			: result.hostnames.join('\n') + '\n';

	return negotiate(
		request,
		{ ip: params.ip, ptr: result.hostnames },
		plaintext,
		200,
		'private, max-age=300'
	);
};
