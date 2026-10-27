/**
 * BGP routing info via RIPEstat (stat.ripe.net — free, no key; asks callers
 * to identify themselves with ?sourceapp). An IP or prefix gets the announced
 * prefix, its origin AS and RPKI validity; an ASN gets its holder, announced
 * prefixes and best-connected upstream-side neighbours. Cached for an hour.
 */

import { cacheJson, cacheKey, readCachedJson } from '#lib/server/cache.js';
import { calculateCidr, parseIpv4 } from '#lib/server/cidr.js';
import { expandIpv6, toArpaName } from '#lib/server/dns.js';

const RIPESTAT = 'https://stat.ripe.net/data';
const CACHE_TTL_SECONDS = 3600;
const TOP_NEIGHBOURS = 10;

export type PrefixRouting = {
	kind: 'prefix';
	query: string;
	prefix: string | null;
	announced: boolean;
	origins: Array<{ asn: number; holder: string }>;
	rpki: string | null;
	block: string | null;
};

export type AsnRouting = {
	kind: 'asn';
	asn: number;
	holder: string | null;
	announced: boolean;
	ipv4Prefixes: string[];
	ipv6Prefixes: string[];
	neighbours: { total: number; upstreamSide: number; downstreamSide: number };
	topUpstreams: number[];
};

export type Routing = PrefixRouting | AsnRouting;

export type BgpResult =
	{ ok: true; routing: Routing } | { ok: false; error: string; status: number };

class UpstreamError extends Error {}

const ripestat = async <T>(fetcher: typeof fetch, call: string, params: string): Promise<T> => {
	let response: Response;
	try {
		response = await fetcher(`${RIPESTAT}/${call}/data.json?${params}&sourceapp=addr.fyi`, {
			signal: AbortSignal.timeout(8000)
		});
	} catch (err) {
		throw new UpstreamError(`RIPEstat unavailable (${err instanceof Error ? err.message : err})`);
	}
	if (!response.ok) throw new UpstreamError(`RIPEstat returned ${response.status}`);
	return ((await response.json()) as { data: T }).data;
};

/** Numeric sort for prefixes: IPv4 by value, IPv6 by expanded form. */
const prefixSortKey = (prefix: string): string => {
	const [address, length] = prefix.split('/');
	const v4 = parseIpv4(address);
	const base =
		v4 !== null ? v4.toString(16).padStart(8, '0') : (expandIpv6(address)?.join('') ?? address);
	return `${base}/${length.padStart(3, '0')}`;
};

const sortPrefixes = (prefixes: string[]) =>
	prefixes.sort((a, b) => (prefixSortKey(a) < prefixSortKey(b) ? -1 : 1));

const lookupPrefix = async (fetcher: typeof fetch, query: string): Promise<PrefixRouting> => {
	type Overview = {
		announced: boolean;
		resource: string;
		asns: Array<{ asn: number; holder: string }>;
		block?: { desc?: string };
	};
	const data = await ripestat<Overview>(
		fetcher,
		'prefix-overview',
		`resource=${encodeURIComponent(query)}`
	);
	const prefix = data.announced ? data.resource : null;

	let rpki: string | null = null;
	if (prefix && data.asns[0]) {
		type Rpki = { status: string };
		const params = `resource=${data.asns[0].asn}&prefix=${encodeURIComponent(prefix)}`;
		rpki = await ripestat<Rpki>(fetcher, 'rpki-validation', params).then(
			(r) => r.status,
			() => null // RPKI is a nice-to-have; the routing answer stands without it
		);
	}

	return {
		kind: 'prefix',
		query,
		prefix,
		announced: data.announced,
		origins: data.asns,
		rpki,
		block: data.block?.desc ?? null
	};
};

const lookupAsn = async (fetcher: typeof fetch, asn: number): Promise<AsnRouting> => {
	type Overview = { holder?: string; announced: boolean };
	type Prefixes = { prefixes: Array<{ prefix: string }> };
	type Neighbours = {
		neighbour_counts: { left: number; right: number; unique: number };
		neighbours: Array<{ asn: number; type: string; power: number }>;
	};
	const resource = `resource=AS${asn}`;
	const [overview, prefixes, neighbours] = await Promise.all([
		ripestat<Overview>(fetcher, 'as-overview', resource),
		ripestat<Prefixes>(fetcher, 'announced-prefixes', resource),
		ripestat<Neighbours>(fetcher, 'asn-neighbours', resource)
	]);

	const all = prefixes.prefixes.map((p) => p.prefix);
	return {
		kind: 'asn',
		asn,
		holder: overview.holder ?? null,
		announced: overview.announced,
		ipv4Prefixes: sortPrefixes(all.filter((p) => !p.includes(':'))),
		ipv6Prefixes: sortPrefixes(all.filter((p) => p.includes(':'))),
		neighbours: {
			total: neighbours.neighbour_counts.unique,
			upstreamSide: neighbours.neighbour_counts.left,
			downstreamSide: neighbours.neighbour_counts.right
		},
		topUpstreams: neighbours.neighbours
			.filter((n) => n.type === 'left')
			.sort((a, b) => b.power - a.power)
			.slice(0, TOP_NEIGHBOURS)
			.map((n) => n.asn)
	};
};

export const lookupBgp = async (fetcher: typeof fetch, query: string): Promise<BgpResult> => {
	const asn = query.match(/^(?:as)?(\d{1,10})$/i);
	const isPrefix = query.includes('/') ? calculateCidr(query) !== null : toArpaName(query) !== null;
	if (!asn && !isPrefix) {
		return {
			ok: false,
			error: 'expected an IP address, a CIDR prefix, or an ASN (e.g. AS13335)',
			status: 400
		};
	}

	const key = cacheKey(`ripestat/${asn ? `as${asn[1]}` : query.toLowerCase()}`);
	const stored = await readCachedJson<Routing>(key);
	if (stored) return { ok: true, routing: stored };

	try {
		const routing = asn
			? await lookupAsn(fetcher, Number(asn[1]))
			: await lookupPrefix(fetcher, query);
		cacheJson(key, routing, CACHE_TTL_SECONDS);
		return { ok: true, routing };
	} catch (err) {
		if (err instanceof UpstreamError) return { ok: false, error: err.message, status: 502 };
		throw err;
	}
};

export const formatBgp = (r: Routing): string => {
	if (r.kind === 'prefix') {
		const lines = [`Query: ${r.query}`];
		if (!r.announced) {
			lines.push('Announced: no — not visible in the global routing table');
			if (r.block) lines.push(`Block: ${r.block}`);
			return lines.join('\n') + '\n';
		}
		lines.push(`Prefix: ${r.prefix}`, 'Announced: yes');
		lines.push(...r.origins.map((o) => `Origin: AS${o.asn} ${o.holder}`));
		if (r.rpki) lines.push(`RPKI: ${r.rpki}`);
		return lines.join('\n') + '\n';
	}

	const lines = [`ASN: AS${r.asn}`];
	if (r.holder) lines.push(`Holder: ${r.holder}`);
	lines.push(`Announced: ${r.announced ? 'yes' : 'no'}`);
	lines.push(`Prefixes: ${r.ipv4Prefixes.length} IPv4, ${r.ipv6Prefixes.length} IPv6`);
	lines.push(
		`Neighbours: ${r.neighbours.total} (${r.neighbours.upstreamSide} upstream-side, ${r.neighbours.downstreamSide} downstream-side)`
	);
	if (r.topUpstreams.length) {
		lines.push(`Top upstream-side: ${r.topUpstreams.map((a) => `AS${a}`).join(', ')}`);
	}
	lines.push(...[...r.ipv4Prefixes, ...r.ipv6Prefixes].map((p) => `Prefix: ${p}`));
	return lines.join('\n') + '\n';
};
