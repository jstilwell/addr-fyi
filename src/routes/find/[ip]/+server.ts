import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const ip = params.ip;

	// Using ip-api.com free API for geolocation
	const response = await fetch(`http://ip-api.com/json/${ip}`);
	const data = await response.json();

	if (data.status === 'fail') {
		return new Response(`Error: ${data.message}\n`, {
			status: 400,
			headers: { 'Content-Type': 'text/plain' }
		});
	}

	const output = `IP: ${data.query}
Country: ${data.country}
Region: ${data.regionName}
City: ${data.city}
ZIP: ${data.zip}
Latitude: ${data.lat}
Longitude: ${data.lon}
ISP: ${data.isp}
`;

	return new Response(output, {
		headers: { 'Content-Type': 'text/plain' }
	});
};
