import type { RequestHandler } from './$types';
import { legalPlaintext, PRIVACY } from '$lib/content/legal';
import { text } from '$lib/server/respond';

/** Plaintext privacy policy for curl; browsers get the +page.svelte version. */
export const GET: RequestHandler = () =>
	text(legalPlaintext(PRIVACY), 200, 'private, max-age=3600');
