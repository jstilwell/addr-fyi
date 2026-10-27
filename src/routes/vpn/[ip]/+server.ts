import type { RequestHandler } from './$types';
import { checkVpn, formatVpn } from '#lib/server/vpn.js';
import { negotiate, text } from '#lib/server/respond.js';

/** VPN/proxy/Tor check of any address: /vpn/185.65.134.1. */
export const GET: RequestHandler = async ({ params, fetch, request }) => {
	const result = await checkVpn(fetch, params.ip);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(request, result.check, formatVpn(result.check), 200, 'private, max-age=3600');
};

export const fallback: RequestHandler = () => text('Error: method not allowed\n', 405);
