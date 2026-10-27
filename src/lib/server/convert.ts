/**
 * IP address format converter — pure math, no upstream calls. Accepts dotted
 * IPv4, IPv6 (including embedded-IPv4 forms like ::ffff:1.2.3.4), a plain
 * decimal integer, or 0x-prefixed hex, and shows every representation.
 */

import { compressIpv6, formatIpv4, parseIpv4 } from '#lib/server/cidr.js';
import { expandIpv6, toArpaName } from '#lib/server/dns.js';

export type Conversion = {
	ip: string;
	version: 4 | 6;
	scope: string;
	decimal: string;
	hex: string;
	binary: string | null;
	expanded: string | null;
	ipv4Mapped: string | null;
	embeddedIpv4: string | null;
	reverseDns: string;
};

const IPV4_MAX = 0xffffffffn;
const IPV6_MAX = (1n << 128n) - 1n;

/** [network, prefix length, label] — first match wins, most specific first. */
const V4_SCOPES: Array<[string, number, string]> = [
	['255.255.255.255', 32, 'limited broadcast'],
	['0.0.0.0', 8, '"this network" (RFC 791)'],
	['10.0.0.0', 8, 'private (RFC 1918)'],
	['100.64.0.0', 10, 'shared address space / CGNAT (RFC 6598)'],
	['127.0.0.0', 8, 'loopback'],
	['169.254.0.0', 16, 'link-local'],
	['172.16.0.0', 12, 'private (RFC 1918)'],
	['192.0.0.0', 24, 'IETF protocol assignments'],
	['192.0.2.0', 24, 'documentation (TEST-NET-1)'],
	['192.168.0.0', 16, 'private (RFC 1918)'],
	['198.18.0.0', 15, 'benchmarking (RFC 2544)'],
	['198.51.100.0', 24, 'documentation (TEST-NET-2)'],
	['203.0.113.0', 24, 'documentation (TEST-NET-3)'],
	['224.0.0.0', 4, 'multicast'],
	['240.0.0.0', 4, 'reserved']
];

const V6_SCOPES: Array<[string, number, string]> = [
	['::', 128, 'unspecified'],
	['::1', 128, 'loopback'],
	['::ffff:0:0', 96, 'IPv4-mapped'],
	['64:ff9b::', 96, 'NAT64 (RFC 6052)'],
	['2001::', 32, 'Teredo'],
	['2001:db8::', 32, 'documentation (RFC 3849)'],
	['2002::', 16, '6to4'],
	['fc00::', 7, 'unique local (RFC 4193)'],
	['fe80::', 10, 'link-local'],
	['ff00::', 8, 'multicast'],
	['2000::', 3, 'global unicast']
];

const v4Value = (ip: string): bigint | null => {
	const value = parseIpv4(ip);
	return value === null ? null : BigInt(value);
};

/** IPv6 text → 128-bit value; a trailing dotted quad is folded into the last two groups. */
const v6Value = (ip: string): bigint | null => {
	let text = ip;
	const quad = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
	if (quad) {
		const v4 = parseIpv4(quad[2]);
		if (v4 === null) return null;
		text = `${quad[1]}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
	}
	const groups = expandIpv6(text);
	return groups ? BigInt(`0x${groups.join('')}`) : null;
};

const inRange = (value: bigint, bits: number, network: bigint, prefix: number) =>
	value >> BigInt(bits - prefix) === network >> BigInt(bits - prefix);

const scopeOf = (value: bigint, version: 4 | 6): string => {
	const [table, bits, parse] = version === 4 ? [V4_SCOPES, 32, v4Value] : [V6_SCOPES, 128, v6Value];
	const hit = table.find(([net, prefix]) => inRange(value, bits, parse(net)!, prefix));
	return hit ? hit[2] : version === 4 ? 'public' : 'reserved';
};

const v6Groups = (value: bigint) => {
	const hex = value.toString(16).padStart(32, '0');
	return Array.from({ length: 8 }, (_, i) => hex.slice(i * 4, i * 4 + 4));
};

/** The IPv4 address carried inside an IPv6 one, for the mapped/NAT64/6to4 forms. */
const embeddedIpv4 = (value: bigint): string | null => {
	const low32 = Number(value & IPV4_MAX);
	if (inRange(value, 128, v6Value('::ffff:0:0')!, 96)) return formatIpv4(low32);
	if (inRange(value, 128, v6Value('64:ff9b::')!, 96)) return formatIpv4(low32);
	if (inRange(value, 128, v6Value('2002::')!, 16))
		return formatIpv4(Number((value >> 80n) & IPV4_MAX));
	return null;
};

/** Parse any supported input form into a version + value, or null. */
const parse = (input: string): { version: 4 | 6; value: bigint } | null => {
	const text = input.trim();
	if (/^\d+$/.test(text)) {
		const value = BigInt(text);
		if (value <= IPV4_MAX) return { version: 4, value };
		return value <= IPV6_MAX ? { version: 6, value } : null;
	}
	const hex = text.match(/^0x([0-9a-f]{1,32})$/i);
	if (hex) {
		const value = BigInt(`0x${hex[1]}`);
		return { version: hex[1].length <= 8 ? 4 : 6, value };
	}
	if (text.includes(':')) {
		const value = v6Value(text);
		return value === null ? null : { version: 6, value };
	}
	const value = v4Value(text);
	return value === null ? null : { version: 4, value };
};

export const convertIp = (input: string): Conversion | null => {
	const parsed = parse(input);
	if (!parsed) return null;
	const { version, value } = parsed;

	if (version === 4) {
		const ip = formatIpv4(Number(value));
		return {
			ip,
			version,
			scope: scopeOf(value, 4),
			decimal: value.toString(),
			hex: `0x${value.toString(16).padStart(8, '0')}`,
			binary: ip
				.split('.')
				.map((octet) => Number(octet).toString(2).padStart(8, '0'))
				.join('.'),
			expanded: null,
			ipv4Mapped: `::ffff:${ip}`,
			embeddedIpv4: null,
			reverseDns: toArpaName(ip)!
		};
	}

	const groups = v6Groups(value);
	const ip = compressIpv6(groups);
	return {
		ip,
		version,
		scope: scopeOf(value, 6),
		decimal: value.toString(),
		hex: `0x${value.toString(16).padStart(32, '0')}`,
		binary: null,
		expanded: groups.join(':'),
		ipv4Mapped: null,
		embeddedIpv4: embeddedIpv4(value),
		reverseDns: toArpaName(ip)!
	};
};

export const formatConversion = (c: Conversion): string => {
	const pairs: Array<[string, string | null]> = [
		['IP', c.ip],
		['Version', `IPv${c.version}`],
		['Scope', c.scope],
		['Expanded', c.expanded],
		['Decimal', c.decimal],
		['Hex', c.hex],
		['Binary', c.binary],
		['IPv4-mapped IPv6', c.ipv4Mapped],
		['Embedded IPv4', c.embeddedIpv4],
		['Reverse DNS', c.reverseDns]
	];
	return (
		pairs
			.filter(([, value]) => value !== null)
			.map(([key, value]) => `${key}: ${value}`)
			.join('\n') + '\n'
	);
};
