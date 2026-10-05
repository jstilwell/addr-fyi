/**
 * IP geolocation for arbitrary addresses via ip-api.com, with successful
 * lookups cached at the Cloudflare edge for 24h. The free tier is HTTP-only
 * and rate-limited to 45 req/min, so the cache does double duty: latency and
 * staying under the upstream limit. The data is public and non-sensitive, so
 * the unencrypted upstream hop is acceptable here.
 */

import { cacheJson, cacheKey, readCachedJson } from '#lib/server/cache.js';

const GEO_ENDPOINT = 'http://ip-api.com/json';
const GEO_FIELDS =
	'status,message,query,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,reverse,proxy,hosting';
const CACHE_TTL_SECONDS = 86400;
/** Upstream "fail" answers (private range, invalid query) are deterministic. */
const NEGATIVE_TTL_SECONDS = 3600;

const HOSTNAME = /^(?=.{1,253}\.?$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}\.?$/i;

/**
 * Cheap local sanity check so obvious garbage never spends the upstream's
 * 45 req/min budget. IP-shaped strings pass through for ip-api to judge
 * (it also accepts IPv4-mapped IPv6 and similar forms).
 */
export const isLookupTarget = (query: string): boolean =>
	/^[0-9a-f:.]+$/i.test(query) || HOSTNAME.test(query);

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

export const lookupGeo = async (query: string, fetcher: typeof fetch): Promise<GeoResult> => {
	if (!isLookupTarget(query)) return { ok: false, error: 'invalid query', status: 400 };

	const key = cacheKey(`geo/${encodeURIComponent(query)}`);
	const stored = await readCachedJson<GeoSuccess | GeoFailure>(key);
	if (stored) {
		return stored.status === 'fail'
			? { ok: false, error: stored.message, status: 400 }
			: { ok: true, data: stored, cached: true };
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
		cacheJson(key, data, NEGATIVE_TTL_SECONDS);
		return { ok: false, error: data.message, status: 400 };
	}

	cacheJson(key, data, CACHE_TTL_SECONDS);

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
