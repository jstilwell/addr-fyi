import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { formatCerts, lookupCerts } from '#lib/server/certs.js';
import { negotiate } from '#lib/server/respond.js';

/** Certificates issued for a domain (and its subdomains), from CT logs. */
export const GET: RequestHandler = async ({ params, fetch, request }) => {
	const result = await lookupCerts(fetch, params.domain, env.CERTSPOTTER_API_KEY);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(
		request,
		result.report,
		formatCerts(result.report),
		200,
		'private, max-age=3600'
	);
};
