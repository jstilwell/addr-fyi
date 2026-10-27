import type { PageServerLoad } from './$types';
import { redirectToTool } from '#lib/server/ui-redirect.js';

// The path is someone else's URL: a trailing slash belongs to it, so don't
// let SvelteKit 308-redirect it away (curl doesn't follow redirects by default).
export const trailingSlash = 'ignore';

export const load: PageServerLoad = ({ params, url }) =>
	redirectToTool('http', params.target + url.search);
