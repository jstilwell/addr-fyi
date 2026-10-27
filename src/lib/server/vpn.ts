/**
 * Is this address a VPN, proxy or Tor exit? No single source knows, so the
 * check combines signals into one verdict:
 *  - ip-api's `proxy` flag (known VPN, proxy and Tor addresses) and `hosting`
 *    flag (datacenter ranges, where most commercial VPN servers live);
 *  - the Tor Project's list of current exit addresses (IPv4 only), cached for
 *    an hour;
 *  - for the caller's own connection, headers an HTTP proxy adds on the way.
 * The browser-only signals (WebRTC, timezone) are checked by the UI.
 */

import { cacheJson, cacheKey, readCachedJson } from '#lib/server/cache.js';
import { lookupGeo } from '#lib/server/geo.js';

const TOR_EXIT_LIST = 'https://check.torproject.org/torbulkexitlist';
const TOR_TTL_SECONDS = 3600;

/**
 * Cloudflare passes these through untouched and sets none of them itself (it
 * uses CF-Connecting-IP and X-Real-IP), so any that arrive came from the
 * client or a proxy in front of it.
 */
const PROXY_HEADERS = ['via', 'forwarded', 'x-forwarded-for'];

export type VpnVerdict = 'tor' | 'proxy' | 'hosting' | 'none';

export type VpnCheck = {
	ip: string;
	verdict: VpnVerdict;
	/** null: unknown — an IPv6 address, or the exit list was unavailable. */
	tor: boolean | null;
	proxy: boolean;
	hosting: boolean;
	/** null: not checked — only the caller's own connection carries them. */
	proxyHeaders: Record<string, string> | null;
	isp: string;
	as: string;
	location: string;
	timezone: string;
};

export type VpnResult =
	{ ok: true; check: VpnCheck } | { ok: false; error: string; status: number };

const VERDICTS: Record<VpnVerdict, string> = {
	tor: 'Tor exit node',
	proxy: 'likely a VPN or proxy',
	hosting: 'possibly a VPN — a datacenter address',
	none: 'no sign of a VPN or proxy'
};

export const proxyHeaders = (headers: Headers): Record<string, string> =>
	Object.fromEntries(
		PROXY_HEADERS.flatMap((name) => {
			const value = headers.get(name);
			return value ? [[name, value]] : [];
		})
	);

/** Current Tor exit addresses, or null when the list can't be fetched. */
const torExits = async (fetcher: typeof fetch): Promise<Set<string> | null> => {
	const key = cacheKey('tor/exits');
	const stored = await readCachedJson<string[]>(key);
	if (stored) return new Set(stored);

	try {
		const response = await fetcher(TOR_EXIT_LIST, { signal: AbortSignal.timeout(5000) });
		if (!response.ok) return null;
		const exits = (await response.text())
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => /^\d{1,3}(\.\d{1,3}){3}$/.test(line));
		if (exits.length === 0) return null;
		cacheJson(key, exits, TOR_TTL_SECONDS);
		return new Set(exits);
	} catch {
		return null;
	}
};

/** `headers`: the caller's proxy headers, when checking their own connection. */
export const checkVpn = async (
	fetcher: typeof fetch,
	query: string,
	headers: Record<string, string> | null = null
): Promise<VpnResult> => {
	const [geo, exits] = await Promise.all([lookupGeo(query, fetcher), torExits(fetcher)]);
	if (!geo.ok) return geo;

	const { data } = geo;
	// ip-api resolves hostnames; data.query is the address it actually checked.
	const tor = data.query.includes(':') || !exits ? null : exits.has(data.query);
	const proxied = headers !== null && Object.keys(headers).length > 0;

	return {
		ok: true,
		check: {
			ip: data.query,
			verdict: tor ? 'tor' : data.proxy || proxied ? 'proxy' : data.hosting ? 'hosting' : 'none',
			tor,
			proxy: data.proxy,
			hosting: data.hosting,
			proxyHeaders: headers,
			isp: data.isp,
			as: data.as,
			location: [data.city, `${data.country} (${data.countryCode})`].filter(Boolean).join(', '),
			timezone: data.timezone
		}
	};
};

const yesNo = (value: boolean | null) => (value === null ? 'unknown' : value ? 'yes' : 'no');

export const formatVpn = (c: VpnCheck): string => {
	const lines = [
		`IP: ${c.ip}`,
		`Verdict: ${VERDICTS[c.verdict]}`,
		`Tor exit: ${yesNo(c.tor)}`,
		`VPN/proxy: ${yesNo(c.proxy)}`,
		`Datacenter: ${yesNo(c.hosting)}`
	];
	if (c.proxyHeaders) {
		const found = Object.entries(c.proxyHeaders);
		lines.push(
			...(found.length
				? found.map(([name, value]) => `Proxy header: ${name}: ${value}`)
				: ['Proxy header: none'])
		);
	}
	lines.push(`ISP: ${c.isp}`, `AS: ${c.as}`, `Location: ${c.location}`, `Timezone: ${c.timezone}`);
	return lines.join('\n') + '\n';
};
