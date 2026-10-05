import type { RequestHandler } from './$types';
import { formatWeather, getWeather } from '#lib/server/weather.js';
import { negotiate } from '#lib/server/respond.js';

/**
 * Weather at the visitor's location, derived from Cloudflare's edge
 * geolocation of their IP — no input needed.
 */
export const GET: RequestHandler = async ({ request, fetch }) => {
	const cf = request.cf;
	const latitude = Number(cf?.latitude);
	const longitude = Number(cf?.longitude);

	if (!cf?.latitude || !cf?.longitude || Number.isNaN(latitude) || Number.isNaN(longitude)) {
		const error = 'location unavailable (edge geolocation missing for this request)';
		return negotiate(request, { error }, `Error: ${error}\n`, 503);
	}

	const result = await getWeather(fetch, {
		latitude,
		longitude,
		country: (cf.country as string) ?? '',
		city: (cf.city as string) ?? null,
		region: (cf.region as string) ?? null
	});

	if (!result.ok) {
		return negotiate(request, { error: result.error }, `Error: ${result.error}\n`, result.status);
	}

	return negotiate(
		request,
		result.report,
		formatWeather(result.report),
		200,
		'private, max-age=600'
	);
};
