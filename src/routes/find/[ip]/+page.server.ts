import type { PageServerLoad } from './$types';
import { redirectToTool } from '#lib/server/ui-redirect.js';

export const load: PageServerLoad = ({ params }) => redirectToTool('lookup', params.ip);
