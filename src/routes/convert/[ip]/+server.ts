import type { RequestHandler } from './$types';
import { convertIp, formatConversion } from '#lib/server/convert.js';
import { negotiate } from '#lib/server/respond.js';

/** IP format converter, e.g. /convert/8.8.8.8, /convert/134744072, /convert/::ffff:1.2.3.4. */
export const GET: RequestHandler = ({ params, request }) => {
	const conversion = convertIp(params.ip);

	if (!conversion) {
		const error = 'invalid IP address (use IPv4, IPv6, a decimal integer, or 0x-prefixed hex)';
		return negotiate(request, { error }, `Error: ${error}\n`, 400);
	}

	return negotiate(
		request,
		conversion,
		formatConversion(conversion),
		200,
		'private, max-age=86400'
	);
};
