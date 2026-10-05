import type { RequestHandler } from './$types';
import { PAGES, site } from '#lib/config/site.js';
import { text } from '#lib/server/respond.js';

/** Plaintext sitemap for curl; browsers get the +page.svelte version. */
export const GET: RequestHandler = () =>
	text(PAGES.map((page) => site.url + page.path).join('\n') + '\n', 200, 'private, max-age=3600');
