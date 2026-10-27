import type { RequestHandler } from './$types';
import {
	compareResolvers,
	dohQuery,
	formatPropagation,
	isRecordType,
	ptrLookup,
	RECORD_TYPES,
	toArpaName
} from '#lib/server/dns.js';
import { negotiate } from '#lib/server/respond.js';

/**
 * DNS lookup via DNS-over-HTTPS. Detects what it was given: an IP address
 * gets a reverse (PTR) lookup, a name gets forward records (default A,
 * override with ?type=MX etc). ?resolvers=all asks several public resolvers
 * the same question and compares the answers (a propagation check).
 */
export const GET: RequestHandler = async ({ params, url, fetch, request }) => {
	const arpaName = toArpaName(params.name);

	if (url.searchParams.get('resolvers') === 'all') {
		const type = arpaName ? 'PTR' : (url.searchParams.get('type') ?? 'A').toUpperCase();
		if (!isRecordType(type)) {
			const error = `unsupported record type (use one of: ${RECORD_TYPES.join(', ')})`;
			return negotiate(request, { error }, `Error: ${error}\n`, 400);
		}
		const propagation = await compareResolvers(fetch, arpaName ?? params.name, type);
		return negotiate(
			request,
			propagation,
			formatPropagation(propagation),
			200,
			'private, max-age=60'
		);
	}

	if (arpaName) {
		const result = await ptrLookup(fetch, params.name);
		if (!result.ok) {
			return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
		}

		const plaintext =
			result.hostnames.length === 0
				? `No PTR record for ${params.name}\n`
				: result.hostnames.join('\n') + '\n';

		return negotiate(
			request,
			{ ip: params.name, ptr: result.hostnames },
			plaintext,
			200,
			'private, max-age=300'
		);
	}

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
