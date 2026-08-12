import type { RequestHandler } from './$types';
import { dohQuery, isRecordType, RECORD_TYPES } from '$lib/server/dns';
import { negotiate } from '$lib/server/respond';

/** Forward DNS lookup via DNS-over-HTTPS. Default A; override with ?type=MX etc. */
export const GET: RequestHandler = async ({ params, url, fetch, request }) => {
	const type = (url.searchParams.get('type') ?? 'A').toUpperCase();
	if (!isRecordType(type)) {
		const error = `unsupported record type (use one of: ${RECORD_TYPES.join(', ')})`;
		return negotiate(request, { error }, `Error: ${error}\n`, 400);
	}

	const result = await dohQuery(fetch, params.name, type);
	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	const plaintext =
		result.answers.length === 0
			? `No ${type} records found for ${params.name}\n`
			: result.answers.map((a) => `${a.name}\t${a.ttl}\t${a.type}\t${a.data}`).join('\n') + '\n';

	return negotiate(
		request,
		{ name: params.name, type, answers: result.answers },
		plaintext,
		200,
		'private, max-age=60'
	);
};
