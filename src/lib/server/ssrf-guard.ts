/**
 * SSRF guard for the trace tool: only public, DNS-named HTTPS hosts on port
 * 443 may be probed. We resolve the name and reject if ANY resolved address
 * is private/reserved — validating resolved IPs (not just the name) also
 * defeats DNS rebinding, since the fetch below targets a name we just proved
 * resolves only to public space.
 */

import { dohQuery, expandIpv6 } from '$lib/server/dns';

// Public dotted hostname, no scheme, no port, no path. Bare IP literals and
// custom ports are rejected here so the tool can only reach real websites.
const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,63}$/i;

const isPrivateIpv4 = (ip: string): boolean => {
	const octets = ip.split('.').map(Number);
	if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true;
	const [a, b] = octets;
	return (
		a === 0 || // 0.0.0.0/8
		a === 10 || // 10.0.0.0/8
		a === 127 || // loopback
		(a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
		(a === 169 && b === 254) || // link-local
		(a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
		(a === 192 && b === 168) || // 192.168.0.0/16
		(a === 192 && b === 0) || // 192.0.0.0/24 + 192.0.2.0/24
		(a === 198 && (b === 18 || b === 19)) || // benchmarking
		a >= 224 // multicast + reserved
	);
};

const isPrivateIpv6 = (ip: string): boolean => {
	const groups = expandIpv6(ip);
	if (!groups) return true;
	const first = parseInt(groups[0], 16);
	const value = groups.join('');
	if (value === '0'.repeat(31) + '1') return true; // ::1 loopback
	if (value === '0'.repeat(32)) return true; // ::
	if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
	if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
	if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
	// IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4.
	if (groups.slice(0, 5).every((g) => g === '0000') && groups[5] === 'ffff') {
		const v4 = [
			parseInt(groups[6].slice(0, 2), 16),
			parseInt(groups[6].slice(2), 16),
			parseInt(groups[7].slice(0, 2), 16),
			parseInt(groups[7].slice(2), 16)
		].join('.');
		return isPrivateIpv4(v4);
	}
	return false;
};

export type GuardResult = { ok: true; host: string } | { ok: false; error: string; status: number };

export const guardTraceHost = async (
	fetcher: typeof fetch,
	rawHost: string
): Promise<GuardResult> => {
	const host = rawHost.trim().toLowerCase();

	if (!HOSTNAME_PATTERN.test(host)) {
		return {
			ok: false,
			error: 'invalid host (use a public hostname like example.com — no IPs, ports, or paths)',
			status: 400
		};
	}

	// Resolve every A and AAAA record; refuse if any is private/reserved.
	const [v4, v6] = await Promise.all([
		dohQuery(fetcher, host, 'A'),
		dohQuery(fetcher, host, 'AAAA')
	]);
	if (!v4.ok && !v6.ok) {
		return { ok: false, error: 'host does not resolve', status: 400 };
	}

	const addresses = [
		...(v4.ok ? v4.answers : []).filter((a) => a.type === 'A').map((a) => a.data),
		...(v6.ok ? v6.answers : []).filter((a) => a.type === 'AAAA').map((a) => a.data)
	];

	if (addresses.length === 0) {
		return { ok: false, error: 'host does not resolve to any address', status: 400 };
	}

	for (const address of addresses) {
		const isPrivate = address.includes(':') ? isPrivateIpv6(address) : isPrivateIpv4(address);
		if (isPrivate) {
			return {
				ok: false,
				error: 'host resolves to a private or reserved address',
				status: 403
			};
		}
	}

	return { ok: true, host };
};
