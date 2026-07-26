import type { RequestHandler } from './$types';

type GeoSuccess = {
	status: 'success';
	query: string;
	country: string;
	regionName: string;
	city: string;
	zip: string;
	lat: number;
	lon: number;
	isp: string;
};

type GeoFailure = {
	status: 'fail';
	message: string;
};

type GeoResponse = GeoSuccess | GeoFailure;

const text = (body: string, status = 200) =>
	new Response(body, {
		status,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});

// ip-api.com's free tier is HTTP-only. The data is public and non-sensitive,
// so the unencrypted upstream hop is acceptable here.
const GEO_ENDPOINT = 'http://ip-api.com/json';
const GEO_FIELDS = 'status,message,query,country,regionName,city,zip,lat,lon,isp';

export const GET: RequestHandler = async ({ params, fetch }) => {
	let data: GeoResponse;

	try {
		const response = await fetch(
			`${GEO_ENDPOINT}/${encodeURIComponent(params.ip)}?fields=${GEO_FIELDS}`,
			{ signal: AbortSignal.timeout(5000) }
		);

		if (!response.ok) {
			return text(`Error: lookup service returned ${response.status}\n`, 502);
		}

		data = (await response.json()) as GeoResponse;
	} catch {
		return text('Error: lookup service unavailable\n', 504);
	}

	if (data.status === 'fail') {
		return text(`Error: ${data.message}\n`, 400);
	}

	return text(
		`IP: ${data.query}
Country: ${data.country}
Region: ${data.regionName}
City: ${data.city}
ZIP: ${data.zip}
Latitude: ${data.lat}
Longitude: ${data.lon}
ISP: ${data.isp}
`
	);
};
