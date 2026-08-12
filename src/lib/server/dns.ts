/** DNS-over-HTTPS lookups via Cloudflare's resolver (free, no key, HTTPS). */

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

export const RECORD_TYPES = [
	'A',
	'AAAA',
	'CAA',
	'CNAME',
	'MX',
	'NS',
	'PTR',
	'SOA',
	'SRV',
	'TXT'
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

export const isRecordType = (value: string): value is RecordType =>
	(RECORD_TYPES as readonly string[]).includes(value);

const TYPE_NAMES: Record<number, string> = {
	1: 'A',
	2: 'NS',
	5: 'CNAME',
	6: 'SOA',
	12: 'PTR',
	15: 'MX',
	16: 'TXT',
	28: 'AAAA',
	33: 'SRV',
	46: 'RRSIG',
	257: 'CAA'
};

export type DnsAnswer = {
	name: string;
	type: string;
	ttl: number;
	data: string;
};

export type DohResult =
	{ ok: true; answers: DnsAnswer[] } | { ok: false; error: string; status: number };

type DohJson = {
	Status: number;
	Answer?: Array<{ name: string; type: number; TTL: number; data: string }>;
};

const RCODE_MESSAGES: Record<number, string> = {
	2: 'resolver failure (SERVFAIL)',
	3: 'domain not found (NXDOMAIN)',
	5: 'query refused (REFUSED)'
};

export const dohQuery = async (
	fetcher: typeof fetch,
	name: string,
	type: RecordType
): Promise<DohResult> => {
	let data: DohJson;
	try {
		const response = await fetcher(
			`${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`,
			{
				headers: { accept: 'application/dns-json' },
				signal: AbortSignal.timeout(5000)
			}
		);
		if (!response.ok) {
			return { ok: false, error: `resolver returned ${response.status}`, status: 502 };
		}
		data = (await response.json()) as DohJson;
	} catch {
		return { ok: false, error: 'resolver unavailable', status: 504 };
	}

	if (data.Status !== 0) {
		return {
			ok: false,
			error: RCODE_MESSAGES[data.Status] ?? `resolver error (rcode ${data.Status})`,
			status: data.Status === 3 ? 404 : 502
		};
	}

	return {
		ok: true,
		answers: (data.Answer ?? []).map((a) => ({
			name: a.name,
			type: TYPE_NAMES[a.type] ?? `TYPE${a.type}`,
			ttl: a.TTL,
			data: a.data
		}))
	};
};

export type PtrResult =
	{ ok: true; hostnames: string[] } | { ok: false; error: string; status: number };

/** Reverse (PTR) lookup for an IPv4 or IPv6 address. */
export const ptrLookup = async (fetcher: typeof fetch, ip: string): Promise<PtrResult> => {
	const arpaName = toArpaName(ip);
	if (!arpaName) return { ok: false, error: 'invalid IP address', status: 400 };

	const result = await dohQuery(fetcher, arpaName, 'PTR');
	if (!result.ok) return result;

	return { ok: true, hostnames: result.answers.map((a) => a.data.replace(/\.$/, '')) };
};

/** Convert an IP address to its reverse-lookup (.arpa) name, or null if invalid. */
export const toArpaName = (ip: string): string | null => {
	if (ip.includes(':')) {
		const groups = expandIpv6(ip);
		if (!groups) return null;
		const nibbles = groups.join('').split('').reverse().join('.');
		return `${nibbles}.ip6.arpa`;
	}

	const octets = ip.split('.');
	if (octets.length !== 4) return null;
	for (const octet of octets) {
		if (!/^\d{1,3}$/.test(octet) || Number(octet) > 255) return null;
	}
	return `${octets.reverse().join('.')}.in-addr.arpa`;
};

/** Expand an IPv6 address into 8 zero-padded 4-char hex groups, or null if invalid. */
export const expandIpv6 = (ip: string): string[] | null => {
	const halves = ip.split('::');
	if (halves.length > 2) return null;

	const head = halves[0] === '' ? [] : halves[0].split(':');
	const tail = halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : [];
	const groups =
		halves.length === 2
			? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
			: head;

	if (groups.length !== 8) return null;
	const expanded: string[] = [];
	for (const group of groups) {
		if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
		expanded.push(group.padStart(4, '0').toLowerCase());
	}
	return expanded;
};
