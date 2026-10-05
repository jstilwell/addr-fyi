import type { RequestHandler } from './$types';
import { getClientInfo } from '#lib/server/client-info.js';

/** Everything we know about the visitor, straight from the edge (request.cf). */
export const GET: RequestHandler = ({ request, getClientAddress }) => {
	return Response.json(getClientInfo(request, request.cf, getClientAddress()), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
