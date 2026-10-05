import type { RequestHandler } from './$types';
import { negotiate } from '#lib/server/respond.js';

/** Echo the client's User-Agent string. */
export const GET: RequestHandler = ({ request }) => {
	const userAgent = request.headers.get('user-agent') ?? '';
	return negotiate(request, { userAgent }, userAgent + '\n');
};
