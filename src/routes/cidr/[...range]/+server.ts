import type { RequestHandler } from './$types';
import { calculateCidr, formatCidr } from '$lib/server/cidr';
import { negotiate } from '$lib/server/respond';

/** Subnet calculator, e.g. /cidr/10.0.0.0/24 or /cidr/2001:db8::/48. */
export const GET: RequestHandler = ({ params, request }) => {
	const info = calculateCidr(params.range);

	if (!info) {
		const error = 'invalid CIDR range (use address/prefix, e.g. 10.0.0.0/24)';
		return negotiate(request, { error }, `Error: ${error}\n`, 400);
	}

	return negotiate(request, info, formatCidr(info), 200, 'public, max-age=86400');
};
