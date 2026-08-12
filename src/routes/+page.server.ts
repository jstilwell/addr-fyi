import type { PageServerLoad } from './$types';
import { getClientInfo } from '$lib/server/client-info';

export const load: PageServerLoad = ({ request, platform, getClientAddress }) => {
	return {
		client: getClientInfo(request, platform?.cf, getClientAddress()),
		headers: Object.fromEntries(request.headers)
	};
};
