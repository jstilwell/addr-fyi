import type { PageServerLoad } from './$types';
import { redirectToTool } from '$lib/server/ui-redirect';

export const load: PageServerLoad = ({ params, url }) => {
	const type = url.searchParams.get('type');
	return redirectToTool('dns', params.name, type ? { type } : {});
};
