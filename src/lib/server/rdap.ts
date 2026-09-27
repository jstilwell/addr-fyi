/**
 * WHOIS-style lookups via RDAP (the JSON-over-HTTPS successor to whois).
 * rdap.org bootstraps to the authoritative registry for IPs, domains, and
 * ASNs. Successful lookups are cached at the edge for 6h. Note: gTLDs all
 * support RDAP; some ccTLDs still don't and will return "no record found".
 */

import { site } from '$lib/config/site';
import { cacheJson, cacheKey, readCachedJson } from '$lib/server/cache';
import { toArpaName } from '$lib/server/dns';

const RDAP_BOOTSTRAP = 'https://rdap.org';
const CACHE_TTL_SECONDS = 21600;
/** "No record" answers are cached briefly so repeated misses skip the registry. */
const NEGATIVE_TTL_SECONDS = 3600;

type RdapEntity = {
	roles?: string[];
	vcardArray?: [string, Array<[string, unknown, string, unknown]>];
	entities?: RdapEntity[];
};

type RdapResponse = {
	ldhName?: string;
	unicodeName?: string;
	handle?: string;
	status?: string[];
	events?: Array<{ eventAction: string; eventDate: string }>;
	nameservers?: Array<{ ldhName: string }>;
	secureDNS?: { delegationSigned?: boolean };
	entities?: RdapEntity[];
	startAddress?: string;
	endAddress?: string;
	name?: string;
	type?: string;
	country?: string;
	cidr0_cidrs?: Array<{ v4prefix?: string; v6prefix?: string; length: number }>;
	startAutnum?: number;
	endAutnum?: number;
};

export type WhoisSummary = {
	kind: 'domain' | 'ip' | 'asn';
	query: string;
	name: string | null;
	handle: string | null;
	status: string | null;
	registrar: string | null;
	organization: string | null;
	abuseContact: string | null;
	nameservers: string[] | null;
	dnssec: string | null;
	range: string | null;
	cidr: string | null;
	netType: string | null;
	country: string | null;
	registered: string | null;
	updated: string | null;
	expires: string | null;
	source: string;
};

export type WhoisResult =
	| { ok: true; summary: WhoisSummary; cached: boolean }
	| { ok: false; error: string; status: number };

const classify = (query: string): { kind: WhoisSummary['kind']; path: string } => {
	if (toArpaName(query)) return { kind: 'ip', path: `ip/${encodeURIComponent(query)}` };
	const asn = query.match(/^(?:as)?(\d+)$/i);
	if (asn) return { kind: 'asn', path: `autnum/${asn[1]}` };
	return { kind: 'domain', path: `domain/${encodeURIComponent(query)}` };
};

const findEntity = (entities: RdapEntity[] | undefined, role: string): RdapEntity | null => {
	for (const entity of entities ?? []) {
		if (entity.roles?.includes(role)) return entity;
		const nested = findEntity(entity.entities, role);
		if (nested) return nested;
	}
	return null;
};

const vcardValue = (entity: RdapEntity | null, key: string): string | null => {
	const match = entity?.vcardArray?.[1]?.find((field) => field[0] === key);
	return match ? String(match[3]) : null;
};

const eventDate = (data: RdapResponse, action: string): string | null => {
	const event = data.events?.find((e) => e.eventAction === action);
	return event ? event.eventDate.slice(0, 10) : null;
};

/** Message rebuilt per request so it echoes the query exactly as typed. */
const notFound = (kind: WhoisSummary['kind'], query: string): WhoisResult => ({
	ok: false,
	error: `no ${kind} record found for ${query}`,
	status: 404
});

export const lookupWhois = async (
	query: string,
	fetcher: typeof fetch,
	platform: App.Platform | undefined
): Promise<WhoisResult> => {
	const { kind, path } = classify(query);
	const key = cacheKey(`rdap/${path}`);
	const stored = await readCachedJson<WhoisSummary | { notFound: true }>(platform, key);
	if (stored) {
		return 'notFound' in stored
			? notFound(kind, query)
			: { ok: true, summary: stored, cached: true };
	}

	let data: RdapResponse;
	let source: string;
	try {
		// rdap.org 302-redirects to the authoritative registry; fetch follows it.
		const response = await fetcher(`${RDAP_BOOTSTRAP}/${path}`, {
			// rdap.org 403s requests without a User-Agent (Workers send none by default).
			headers: {
				accept: 'application/rdap+json',
				'user-agent': `addr.fyi/${site.version} (+${site.url})`
			},
			signal: AbortSignal.timeout(8000)
		});
		if (response.status === 404) {
			cacheJson(platform, key, { notFound: true }, NEGATIVE_TTL_SECONDS);
			return notFound(kind, query);
		}
		if (!response.ok) {
			return { ok: false, error: `registry returned ${response.status}`, status: 502 };
		}
		source = response.url;
		data = (await response.json()) as RdapResponse;
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `registry unavailable (${detail})`, status: 504 };
	}

	const registrar = findEntity(data.entities, 'registrar');
	const registrant = findEntity(data.entities, 'registrant');
	const abuse = findEntity(data.entities, 'abuse');

	const summary: WhoisSummary = {
		kind,
		query,
		name: data.unicodeName ?? data.ldhName ?? data.name ?? null,
		handle: data.handle ?? null,
		status: data.status?.join(', ') ?? null,
		registrar: vcardValue(registrar, 'fn'),
		organization: vcardValue(registrant, 'fn') ?? vcardValue(registrant, 'org'),
		abuseContact: vcardValue(abuse, 'email'),
		nameservers: data.nameservers?.map((ns) => ns.ldhName.toLowerCase()) ?? null,
		dnssec:
			data.secureDNS?.delegationSigned === undefined
				? null
				: data.secureDNS.delegationSigned
					? 'signed'
					: 'unsigned',
		range:
			kind === 'asn' && data.startAutnum !== undefined
				? data.startAutnum === data.endAutnum
					? `AS${data.startAutnum}`
					: `AS${data.startAutnum} - AS${data.endAutnum}`
				: data.startAddress && data.endAddress
					? `${data.startAddress} - ${data.endAddress}`
					: null,
		cidr:
			data.cidr0_cidrs?.map((c) => `${c.v4prefix ?? c.v6prefix}/${c.length}`).join(', ') ?? null,
		netType: data.type ?? null,
		country: data.country ?? null,
		registered: eventDate(data, 'registration'),
		updated: eventDate(data, 'last changed'),
		expires: eventDate(data, 'expiration'),
		source
	};

	cacheJson(platform, key, summary, CACHE_TTL_SECONDS);

	return { ok: true, summary, cached: false };
};

export const formatWhois = (s: WhoisSummary): string => {
	const label = s.kind === 'domain' ? 'Domain' : s.kind === 'ip' ? 'Network' : 'ASN';
	const pairs: Array<[string, string | null]> = [
		[label, s.name ?? s.query],
		['Handle', s.handle],
		['Range', s.range],
		['CIDR', s.cidr],
		['Type', s.netType],
		['Country', s.country],
		['Status', s.status],
		['Registrar', s.registrar],
		['Org', s.organization],
		['Abuse', s.abuseContact],
		['Nameservers', s.nameservers?.join(', ') ?? null],
		['DNSSEC', s.dnssec],
		['Registered', s.registered],
		['Updated', s.updated],
		['Expires', s.expires],
		['Source', s.source]
	];
	return (
		pairs
			.filter(([, value]) => value !== null && value !== '')
			.map(([key, value]) => `${key}: ${value}`)
			.join('\n') + '\n'
	);
};
