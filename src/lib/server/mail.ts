/**
 * Email deliverability check for a domain: MX, SPF (with a recursive count of
 * DNS-querying terms against RFC 7208's limit of 10), DMARC, DKIM (common
 * selectors only — selectors can't be enumerated), MTA-STS, TLS-RPT and BIMI.
 * Every lookup goes through DoH; the only other request is the MTA-STS policy
 * file. Lookups are injected so the logic is testable offline.
 */

import type { DohResult, RecordType } from '#lib/server/dns.js';

export type Lookup = (name: string, type: RecordType) => Promise<DohResult>;

/**
 * Selectors used by the big mail providers (Google, Microsoft 365, Mailchimp,
 * SendGrid, Fastmail's rotating fm1–fm3, Proton, Zoho) and common defaults.
 */
export const DKIM_SELECTORS = [
	'google',
	'selector1',
	'selector2',
	'default',
	'k1',
	's1',
	's2',
	'fm1',
	'fm2',
	'fm3',
	'protonmail',
	'zmail',
	'mail',
	'dkim'
] as const;

const SPF_LOOKUP_LIMIT = 10;
/** Stop recursing through includes past this depth (loops, absurd chains). */
const SPF_MAX_DEPTH = 6;

export type MailReport = {
	domain: string;
	mx: Array<{ preference: number; host: string }>;
	nullMx: boolean;
	spf: string | null;
	spfLookups: number | null;
	dmarc: string | null;
	dmarcPolicy: string | null;
	dkimSelectors: string[];
	mtaSts: string | null;
	mtaStsMode: string | null;
	tlsRpt: string | null;
	bimi: string | null;
	issues: string[];
};

/** A TXT record's text: DoH returns it quoted, long values split into chunks. */
export const txtValue = (data: string): string => {
	const chunks = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
		m[1].replace(/\\(.)/g, '$1')
	);
	return chunks.length ? chunks.join('') : data;
};

/** `k=v; k=v` tag lists (DMARC, TLS-RPT, BIMI, MTA-STS) → lower-cased keys. */
export const parseTags = (record: string): Record<string, string> =>
	Object.fromEntries(
		record
			.split(';')
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => {
				const eq = part.indexOf('=');
				return eq === -1
					? [part.toLowerCase(), '']
					: [part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim()];
			})
	);

/** TXT records at `name`; NXDOMAIN reads as "none", other failures throw. */
const txtRecords = async (lookup: Lookup, name: string): Promise<string[]> => {
	const result = await lookup(name, 'TXT');
	if (!result.ok) {
		if (result.status === 404) return [];
		throw new Error(result.error);
	}
	return result.answers.filter((a) => a.type === 'TXT').map((a) => txtValue(a.data));
};

/** The one record at `name` starting with `prefix` (case-insensitive), if any. */
const findRecord = (records: string[], prefix: string) =>
	records.filter((r) => r.toLowerCase().startsWith(prefix.toLowerCase()));

/**
 * Count the DNS-querying terms in an SPF record, following include: and
 * redirect= targets. Returns as soon as the count passes the limit.
 */
export const countSpfLookups = async (
	lookup: Lookup,
	record: string,
	depth = 0,
	seen = new Set<string>()
): Promise<number> => {
	let count = 0;
	for (const raw of record.split(/\s+/).slice(1)) {
		const term = raw.replace(/^[+\-~?]/, '').toLowerCase();
		const target = term.match(/^(?:include:|redirect=)(.+)$/)?.[1];
		if (target) {
			count++;
			if (depth < SPF_MAX_DEPTH && !seen.has(target)) {
				seen.add(target);
				const nested = findRecord(await txtRecords(lookup, target), 'v=spf1 ')[0];
				if (nested) count += await countSpfLookups(lookup, nested, depth + 1, seen);
			}
		} else if (/^(a|mx|ptr)([:/]|$)|^exists:/.test(term)) {
			count++;
		}
		if (count > SPF_LOOKUP_LIMIT) break;
	}
	return count;
};

/** "mode: enforce" from https://mta-sts.<domain>/.well-known/mta-sts.txt. */
const mtaStsMode = async (fetcher: typeof fetch, domain: string): Promise<string | null> => {
	try {
		const response = await fetcher(`https://mta-sts.${domain}/.well-known/mta-sts.txt`, {
			signal: AbortSignal.timeout(4000)
		});
		if (!response.ok) return null;
		return (await response.text()).match(/^mode:\s*(\w+)/im)?.[1].toLowerCase() ?? null;
	} catch {
		return null;
	}
};

export type MailResult =
	{ ok: true; report: MailReport } | { ok: false; error: string; status: number };

export const checkMail = async (
	lookup: Lookup,
	fetcher: typeof fetch,
	domain: string
): Promise<MailResult> => {
	const name = domain.toLowerCase().replace(/\.$/, '');
	if (
		!/^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(name)
	) {
		return { ok: false, error: 'invalid domain name', status: 400 };
	}

	const mxResult = await lookup(name, 'MX');
	if (!mxResult.ok) return mxResult;

	try {
		const [rootTxt, dmarcTxt, stsTxt, tlsTxt, bimiTxt, ...dkimTxt] = await Promise.all([
			txtRecords(lookup, name),
			txtRecords(lookup, `_dmarc.${name}`),
			txtRecords(lookup, `_mta-sts.${name}`),
			txtRecords(lookup, `_smtp._tls.${name}`),
			txtRecords(lookup, `default._bimi.${name}`),
			...DKIM_SELECTORS.map((s) => txtRecords(lookup, `${s}._domainkey.${name}`))
		]);

		const issues: string[] = [];
		const mx = mxResult.answers
			.filter((a) => a.type === 'MX')
			.map((a) => {
				const [preference, host] = a.data.split(/\s+/);
				return { preference: Number(preference), host: host.replace(/\.$/, '') || '.' };
			})
			.sort((a, b) => a.preference - b.preference);
		const nullMx = mx.length === 1 && mx[0].host === '.';
		if (mx.length === 0) issues.push('no MX records: senders fall back to the A record');

		const spfRecords = findRecord(rootTxt, 'v=spf1');
		const spf = spfRecords[0] ?? null;
		let spfLookups: number | null = null;
		if (spfRecords.length > 1) issues.push('multiple SPF records: receivers treat SPF as broken');
		if (!spf) {
			if (!nullMx) issues.push('no SPF record: anyone can claim to send as this domain');
		} else {
			spfLookups = await countSpfLookups(lookup, spf);
			if (spfLookups > SPF_LOOKUP_LIMIT) {
				issues.push(`SPF needs more than ${SPF_LOOKUP_LIMIT} DNS lookups: receivers fail it`);
			}
			if (/\s\+?all\b/i.test(spf)) issues.push('SPF ends in +all: it authorises every server');
			if (!/\s[+\-~?]?all\b|redirect=/i.test(spf)) {
				issues.push('SPF has no "all" term: unlisted senders are neither passed nor failed');
			}
			if (/\sptr\b/i.test(spf)) issues.push('SPF uses the deprecated ptr mechanism');
		}

		const dmarc = findRecord(dmarcTxt, 'v=DMARC1')[0] ?? null;
		const dmarcPolicy = dmarc ? (parseTags(dmarc).p?.toLowerCase() ?? null) : null;
		if (!dmarc) {
			issues.push('no DMARC record: spoofed mail claiming this domain is not rejected');
		} else if (dmarcPolicy === 'none') {
			issues.push('DMARC policy is p=none: monitoring only, spoofed mail is still delivered');
		}

		const dkimSelectors = DKIM_SELECTORS.filter((_, i) =>
			// An empty p= is a revoked key — and what wildcard "no DKIM here"
			// records (e.g. *._domainkey) publish — so only a real key counts.
			dkimTxt[i].some((r) => /(^|;)\s*p=[A-Za-z0-9+/]/.test(r))
		);

		const mtaSts = findRecord(stsTxt, 'v=STSv1')[0] ?? null;
		const mode = mtaSts ? await mtaStsMode(fetcher, name) : null;
		if (mtaSts && !mode) issues.push('MTA-STS record found but the policy file could not be read');

		const report: MailReport = {
			domain: name,
			mx,
			nullMx,
			spf,
			spfLookups,
			dmarc,
			dmarcPolicy,
			dkimSelectors: [...dkimSelectors],
			mtaSts,
			mtaStsMode: mode,
			tlsRpt: findRecord(tlsTxt, 'v=TLSRPTv1')[0] ?? null,
			bimi: findRecord(bimiTxt, 'v=BIMI1')[0] ?? null,
			issues
		};
		return { ok: true, report };
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `lookup failed (${detail})`, status: 502 };
	}
};

export const formatMail = (r: MailReport): string => {
	const none = '(none)';
	const lines = [`Domain: ${r.domain}`];
	if (r.nullMx) lines.push('MX: none — this domain accepts no mail (null MX)');
	else if (r.mx.length === 0) lines.push(`MX: ${none}`);
	else lines.push(...r.mx.map((m) => `MX: ${m.preference} ${m.host}`));
	lines.push(`SPF: ${r.spf ?? none}`);
	if (r.spfLookups !== null) lines.push(`SPF lookups: ${r.spfLookups}/${SPF_LOOKUP_LIMIT}`);
	lines.push(`DMARC: ${r.dmarc ?? none}`);
	lines.push(
		`DKIM: ${r.dkimSelectors.length ? r.dkimSelectors.join(', ') : 'no common selector found'} (checked ${DKIM_SELECTORS.join(', ')})`
	);
	lines.push(
		`MTA-STS: ${r.mtaSts ? `${r.mtaSts}${r.mtaStsMode ? ` (mode: ${r.mtaStsMode})` : ''}` : none}`
	);
	lines.push(`TLS-RPT: ${r.tlsRpt ?? none}`);
	lines.push(`BIMI: ${r.bimi ?? none}`);
	lines.push(...(r.issues.length ? r.issues.map((i) => `Issue: ${i}`) : ['Issues: none found']));
	return lines.join('\n') + '\n';
};
