import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	return new Response(ip + '\n', {
		headers: {
			'Content-Type': 'text/plain'
		}
	});
};
