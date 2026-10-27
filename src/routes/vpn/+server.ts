import type { RequestHandler } from './$types';
import { checkVpn, formatVpn, proxyHeaders } from '#lib/server/vpn.js';
import { negotiate, text } from '#lib/server/respond.js';

/** VPN/proxy/Tor check of the caller's own connection, proxy headers included. */
export const GET: RequestHandler = async ({ fetch, request, getClientAddress }) => {
	const result = await checkVpn(fetch, getClientAddress(), proxyHeaders(request.headers));

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(request, result.check, formatVpn(result.check));
};

export const fallback: RequestHandler = () => text('Error: method not allowed\n', 405);
