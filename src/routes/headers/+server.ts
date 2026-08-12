import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { text, wantsJson } from '$lib/server/respond';

/** Echo the request headers as the server received them. */
export const GET: RequestHandler = ({ request }) => {
	const headers = Object.fromEntries(request.headers);

	if (wantsJson(request)) {
		return json(headers, { headers: { 'Cache-Control': 'no-store' } });
	}

	const lines = Object.entries(headers)
		.map(([name, value]) => `${name}: ${value}`)
		.join('\n');
	return text(lines + '\n');
};
