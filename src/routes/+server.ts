import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ getClientAddress }) => {
	return new Response(getClientAddress() + '\n', {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
