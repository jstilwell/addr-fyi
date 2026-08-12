import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Browsers (Accept: text/html) land here instead of the plaintext handler;
// send them to the UI with the lookup pre-filled.
export const load: PageServerLoad = ({ params }) => {
	redirect(302, `/?q=${encodeURIComponent(params.ip)}`);
};
