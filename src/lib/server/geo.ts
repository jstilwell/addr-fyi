/**
 * IP geolocation for arbitrary addresses via ip-api.com, with successful
 * lookups cached at the Cloudflare edge for 24h. The free tier is HTTP-only
 * and rate-limited to 45 req/min, so the cache does double duty: latency and
 * staying under the upstream limit. The data is public and non-sensitive, so
 * the unencrypted upstream hop is acceptable here.
 */

const GEO_ENDPOINT = 'http://ip-api.com/json';
const GEO_FIELDS =
	'status,message,query,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,reverse,proxy,hosting';
const CACHE_TTL_SECONDS = 86400;

export type GeoSuccess = {
	status: 'success';
	query: string;
	country: string;
	countryCode: string;
	regionName: string;
	city: string;
	zip: string;
	lat: number;
	lon: number;
	timezone: string;
	isp: string;
	org: string;
	as: string;
	reverse: string;
	proxy: boolean;
	hosting: boolean;
};

export type GeoFailure = { status: 'fail'; message: string };

export type GeoResult =
	{ ok: true; data: GeoSuccess; cached: boolean } | { ok: false; error: string; status: number };

/** Synthetic cache key — never fetched, only used to address caches.default. */
const cacheKeyFor = (query: string) =>
	new Request(`https://cache.addr.fyi/geo/${encodeURIComponent(query)}`);

export const lookupGeo = async (
	query: string,
	fetcher: typeof fetch,
	platform: App.Platform | undefined
): Promise<GeoResult> => {
	const cache = platform?.caches?.default;
	const cacheKey = cacheKeyFor(query);

	if (cache) {
		try {
			const hit = await cache.match(cacheKey);
			if (hit) {
				return { ok: true, data: (await hit.json()) as GeoSuccess, cached: true };
			}
		} catch {
			// Cache read failure is non-fatal; fall through to the upstream lookup.
		}
	}

	let data: GeoSuccess | GeoFailure;
	try {
		const response = await fetcher(
			`${GEO_ENDPOINT}/${encodeURIComponent(query)}?fields=${GEO_FIELDS}`,
			{ signal: AbortSignal.timeout(5000) }
		);
		if (!response.ok) {
			return { ok: false, error: `lookup service returned ${response.status}`, status: 502 };
		}
		data = (await response.json()) as GeoSuccess | GeoFailure;
	} catch {
		return { ok: false, error: 'lookup service unavailable', status: 504 };
	}

	if (data.status === 'fail') {
		return { ok: false, error: data.message, status: 400 };
	}

	if (cache && platform) {
		const stored = new Response(JSON.stringify(data), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`
			}
		});
		platform.ctx.waitUntil(cache.put(cacheKey, stored));
	}

	return { ok: true, data, cached: false };
};

/** Shared plaintext rendering so /find and the UI's curl hints stay in sync. */
export const formatGeo = (data: GeoSuccess): string =>
	`IP: ${data.query}
Country: ${data.country} (${data.countryCode})
Region: ${data.regionName}
City: ${data.city}
ZIP: ${data.zip}
Latitude: ${data.lat}
Longitude: ${data.lon}
Timezone: ${data.timezone}
ISP: ${data.isp}
Org: ${data.org}
AS: ${data.as}
Reverse: ${data.reverse || '(none)'}
Proxy: ${data.proxy ? 'yes' : 'no'}
Hosting: ${data.hosting ? 'yes' : 'no'}
`;
