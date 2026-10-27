import type { RequestHandler } from './$types';
import { dohQuery } from '#lib/server/dns.js';
import { checkMail, formatMail } from '#lib/server/mail.js';
import { negotiate } from '#lib/server/respond.js';

/** Email deliverability check: MX, SPF, DMARC, DKIM, MTA-STS, TLS-RPT, BIMI. */
export const GET: RequestHandler = async ({ params, fetch, request }) => {
	const result = await checkMail((name, type) => dohQuery(fetch, name, type), fetch, params.domain);

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(request, result.report, formatMail(result.report), 200, 'private, max-age=300');
};
