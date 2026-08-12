import type { RequestHandler } from './$types';
import { dohQuery, toArpaName } from '$lib/server/dns';
import { negotiate } from '$lib/server/respond';

/** Reverse DNS (PTR) lookup for an IPv4 or IPv6 address via DNS-over-HTTPS. */
export const GET: RequestHandler = async ({ params, fetch, request }) => {
	const arpaName = toArpaName(params.ip);
	if (!arpaName) {
		const error = 'invalid IP address';
		return negotiate(request, { error }, `Error: ${error}\n`, 400);
	}

	const result = await dohQuery(fetch, arpaName, 'PTR');
	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	const hostnames = result.answers.map((a) => a.data.replace(/\.$/, ''));
	const plaintext =
		hostnames.length === 0 ? `No PTR record for ${params.ip}\n` : hostnames.join('\n') + '\n';

	return negotiate(
		request,
		{ ip: params.ip, ptr: hostnames },
		plaintext,
		200,
		'public, max-age=300'
	);
};
