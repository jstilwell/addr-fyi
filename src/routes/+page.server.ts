import type { PageServerLoad } from './$types';
import { getClientInfo } from '$lib/server/client-info';

export const load: PageServerLoad = ({ request, platform, getClientAddress, setHeaders }) => {
	// The page embeds the visitor's IP and headers: never cache it anywhere shared.
	setHeaders({ 'cache-control': 'private, no-store' });
	return {
		client: getClientInfo(request, platform?.cf, getClientAddress()),
		headers: Object.fromEntries(request.headers)
	};
};
