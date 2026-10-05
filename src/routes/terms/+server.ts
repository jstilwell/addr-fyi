import type { RequestHandler } from './$types';
import { legalPlaintext, TERMS } from '#lib/content/legal.js';
import { text } from '#lib/server/respond.js';

/** Plaintext terms of service for curl; browsers get the +page.svelte version. */
export const GET: RequestHandler = () => text(legalPlaintext(TERMS), 200, 'private, max-age=3600');
