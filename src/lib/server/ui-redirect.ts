import { redirect } from '@sveltejs/kit';

/**
 * Browsers (Accept: text/html) hitting a tool endpoint land on the UI instead
 * of raw plaintext: the home page opens `tab` with `query` filled in and runs
 * it. curl and fetch() never get here — they're served by the +server.ts.
 */
export const redirectToTool = (
	tab: string,
	query: string,
	extra: Record<string, string> = {}
): never => {
	redirect(302, `/?${new URLSearchParams({ tab, q: query, ...extra })}`);
};
