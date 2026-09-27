import type { RequestHandler } from './$types';
import { negotiate } from '$lib/server/respond';

export const GET: RequestHandler = ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	return negotiate(request, { ip }, ip + '\n');
};
