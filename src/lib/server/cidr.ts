/** CIDR/subnet calculator — pure math, no upstream calls. IPv4 and IPv6. */

import { expandIpv6 } from '#lib/server/dns.js';

export type CidrInfo = {
	cidr: string;
	version: 4 | 6;
	network: string;
	netmask: string | null;
	wildcard: string | null;
	broadcast: string | null;
	firstHost: string;
	lastHost: string;
	hosts: string;
	totalAddresses: string;
};

const parseIpv4 = (ip: string): number | null => {
	const octets = ip.split('.');
	if (octets.length !== 4) return null;
	let value = 0;
	for (const octet of octets) {
		if (!/^\d{1,3}$/.test(octet) || Number(octet) > 255) return null;
		value = value * 256 + Number(octet);
	}
	return value;
};

const formatIpv4 = (value: number): string =>
	[24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');

const IPV6_MAX = (1n << 128n) - 1n;

const compressIpv6 = (groups: string[]): string => {
	const trimmed = groups.map((g) => g.replace(/^0+(?=.)/, ''));
	let best = -1;
	let bestLen = 0;
	let cur = -1;
	let curLen = 0;
	trimmed.forEach((group, i) => {
		if (group === '0') {
			if (cur === -1) cur = i;
			curLen++;
			if (curLen > bestLen) {
				best = cur;
				bestLen = curLen;
			}
		} else {
			cur = -1;
			curLen = 0;
		}
	});
	if (bestLen < 2) return trimmed.join(':');
	return `${trimmed.slice(0, best).join(':')}::${trimmed.slice(best + bestLen).join(':')}`;
};

const formatIpv6 = (value: bigint): string => {
	const hex = value.toString(16).padStart(32, '0');
	const groups = Array.from({ length: 8 }, (_, i) => hex.slice(i * 4, i * 4 + 4));
	return compressIpv6(groups);
};

export const calculateCidr = (range: string): CidrInfo | null => {
	const [address, prefixStr, extra] = range.split('/');
	if (!address || prefixStr === undefined || extra !== undefined) return null;
	if (!/^\d{1,3}$/.test(prefixStr)) return null;
	const prefix = Number(prefixStr);

	if (address.includes(':')) {
		const groups = expandIpv6(address);
		if (!groups || prefix > 128) return null;

		const value = BigInt('0x' + groups.join(''));
		const mask = prefix === 0 ? 0n : (IPV6_MAX << BigInt(128 - prefix)) & IPV6_MAX;
		const network = value & mask;
		const last = network | (~mask & IPV6_MAX);
		const total = 1n << BigInt(128 - prefix);

		return {
			cidr: `${formatIpv6(network)}/${prefix}`,
			version: 6,
			network: formatIpv6(network),
			netmask: null,
			wildcard: null,
			broadcast: null,
			firstHost: formatIpv6(network),
			lastHost: formatIpv6(last),
			hosts: total.toString(),
			totalAddresses: total.toString()
		};
	}

	const value = parseIpv4(address);
	if (value === null || prefix > 32) return null;

	const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
	const network = (value & mask) >>> 0;
	const broadcast = (network | (~mask >>> 0)) >>> 0;
	const total = 2 ** (32 - prefix);
	// RFC 3021: /31 is a 2-host point-to-point link; /32 is a single host.
	const hosts = prefix >= 31 ? total : total - 2;
	const firstHost = prefix >= 31 ? network : network + 1;
	const lastHost = prefix >= 31 ? broadcast : broadcast - 1;

	return {
		cidr: `${formatIpv4(network)}/${prefix}`,
		version: 4,
		network: formatIpv4(network),
		netmask: formatIpv4(mask),
		wildcard: formatIpv4(~mask >>> 0),
		broadcast: prefix >= 31 ? null : formatIpv4(broadcast),
		firstHost: formatIpv4(firstHost),
		lastHost: formatIpv4(lastHost),
		hosts: hosts.toString(),
		totalAddresses: total.toString()
	};
};

export const formatCidr = (info: CidrInfo): string => {
	const pairs: Array<[string, string | null]> = [
		['CIDR', info.cidr],
		['Network', info.network],
		['Netmask', info.netmask],
		['Wildcard', info.wildcard],
		['Broadcast', info.broadcast],
		['First host', info.firstHost],
		['Last host', info.lastHost],
		['Usable hosts', info.hosts],
		['Total addresses', info.totalAddresses]
	];
	return (
		pairs
			.filter(([, value]) => value !== null)
			.map(([key, value]) => `${key}: ${value}`)
			.join('\n') + '\n'
	);
};
