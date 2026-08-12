import type { RequestHandler } from './$types';
import { formatGeo, lookupGeo } from '$lib/server/geo';
import { negotiate, text } from '$lib/server/respond';

export const GET: RequestHandler = async ({ params, fetch, request, platform }) => {
	const result = await lookupGeo(params.ip, fetch, platform);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(request, result.data, formatGeo(result.data), 200, 'private, max-age=3600');
};

export const fallback: RequestHandler = () => text('Error: method not allowed\n', 405);
