import type { RequestHandler } from './$types';
import { PAGES, site } from '$lib/config/site';
import { text } from '$lib/server/respond';

/** Plaintext sitemap for curl; browsers get the +page.svelte version. */
export const GET: RequestHandler = () =>
	text(PAGES.map((page) => site.url + page.path).join('\n') + '\n', 200, 'private, max-age=3600');
