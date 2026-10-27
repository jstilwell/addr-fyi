import type { RequestHandler } from './$types';
import { checkPort, formatPort } from '#lib/server/port-check.js';
import { negotiate } from '#lib/server/respond.js';

/** Is this port open on *my* IP? Connects back to the caller only, e.g. /port/22. */
export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	// Imported per request, not at the top: SvelteKit analyses routes in Node
	// after building, and Node can't load a cloudflare: module.
	const { connect } = await import('cloudflare:sockets');
	const result = await checkPort(connect, getClientAddress(), params.port);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(request, result.check, formatPort(result.check));
};
