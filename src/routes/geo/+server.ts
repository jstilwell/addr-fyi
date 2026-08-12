import type { RequestHandler } from './$types';
import { getClientInfo } from '$lib/server/client-info';
import { kvText, negotiate } from '$lib/server/respond';

/** The visitor's own geolocation from request.cf — no upstream lookup needed. */
export const GET: RequestHandler = ({ request, platform, getClientAddress }) => {
	const info = getClientInfo(request, platform?.cf, getClientAddress());

	return negotiate(
		request,
		info,
		kvText({
			IP: info.ip,
			Country: info.country,
			Region: info.region,
			City: info.city,
			ZIP: info.zip,
			Latitude: info.latitude,
			Longitude: info.longitude,
			Timezone: info.timezone,
			AS: info.asn ? `AS${info.asn}` : null,
			Org: info.org,
			'CF-Colo': info.colo
		})
	);
};
