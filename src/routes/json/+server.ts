import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClientInfo } from '$lib/server/client-info';

/** Everything we know about the visitor, straight from the edge (request.cf). */
export const GET: RequestHandler = ({ request, platform, getClientAddress }) => {
	return json(getClientInfo(request, platform?.cf, getClientAddress()), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
