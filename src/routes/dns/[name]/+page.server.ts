import type { PageServerLoad } from './$types';
import { redirectToTool } from '#lib/server/ui-redirect.js';

export const load: PageServerLoad = ({ params, url }) => {
	const type = url.searchParams.get('type');
	const resolvers = url.searchParams.get('resolvers');
	return redirectToTool('dns', params.name, {
		...(type && { type }),
		...(resolvers && { resolvers })
	});
};
