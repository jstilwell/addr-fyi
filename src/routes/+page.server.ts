import type { PageServerLoad } from './$types';
import { getClientInfo } from '#lib/server/client-info.js';

export const load: PageServerLoad = ({ request, getClientAddress, setHeaders }) => {
	// The page embeds the visitor's IP and headers: never cache it anywhere shared.
	setHeaders({ 'cache-control': 'private, no-store' });
	return {
		client: getClientInfo(request, request.cf, getClientAddress()),
		headers: Object.fromEntries(request.headers)
	};
};
