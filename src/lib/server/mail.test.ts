import { describe, expect, it } from 'vitest';
import type { DohResult, RecordType } from './dns';
import { checkMail, countSpfLookups, formatMail, parseTags, txtValue, type Lookup } from './mail';

/** A fake resolver: `zone[name][type]` is a list of record data strings. */
const resolver =
	(zone: Record<string, Partial<Record<RecordType, string[]>>>): Lookup =>
	async (name: string, type: RecordType): Promise<DohResult> => {
		if (!(name in zone)) return { ok: false, error: 'domain not found (NXDOMAIN)', status: 404 };
		return {
			ok: true,
			answers: (zone[name][type] ?? []).map((data) => ({ name, type, ttl: 300, data }))
		};
	};

const noFetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

describe('txtValue', () => {
	it('unquotes and joins split chunks', () => {
		expect(txtValue('"v=spf1 include:a.example " "-all"')).toBe('v=spf1 include:a.example -all');
		expect(txtValue('"say \\"hi\\""')).toBe('say "hi"');
		expect(txtValue('unquoted')).toBe('unquoted');
	});
});

describe('parseTags', () => {
	it('splits tag lists', () => {
		expect(parseTags('v=DMARC1; p=Reject; rua=mailto:d@example.com;')).toEqual({
			v: 'DMARC1',
			p: 'Reject',
			rua: 'mailto:d@example.com'
		});
	});
});

describe('countSpfLookups', () => {
	it('follows includes and counts DNS-querying terms', async () => {
		const lookup = resolver({
			'_spf.a.example': { TXT: ['"v=spf1 include:_spf.b.example mx -all"'] },
			'_spf.b.example': { TXT: ['"v=spf1 ip4:192.0.2.0/24 a -all"'] }
		});
		// include(1) + [include(1) + mx(1) + [a(1)]] + exists(1) = 5
		expect(
			await countSpfLookups(
				lookup,
				'v=spf1 include:_spf.a.example exists:%{i}.x.example ip4:1.2.3.4 ~all'
			)
		).toBe(5);
	});

	it('survives include loops', async () => {
		const lookup = resolver({ 'loop.example': { TXT: ['"v=spf1 include:loop.example -all"'] } });
		expect(await countSpfLookups(lookup, 'v=spf1 include:loop.example -all')).toBe(2);
	});
});

describe('checkMail', () => {
	const healthy = {
		'example.com': {
			MX: ['20 backup.example.com.', '10 mx.example.com.'],
			TXT: ['"v=spf1 include:_spf.example.net -all"', '"google-site-verification=abc"']
		},
		'_spf.example.net': { TXT: ['"v=spf1 ip4:192.0.2.0/24 -all"'] },
		'_dmarc.example.com': { TXT: ['"v=DMARC1; p=reject; rua=mailto:dmarc@example.com"'] },
		'google._domainkey.example.com': { TXT: ['"v=DKIM1; k=rsa; p=MIIB"'] },
		'_smtp._tls.example.com': { TXT: ['"v=TLSRPTv1; rua=mailto:tls@example.com"'] }
	};

	it('reports a healthy domain (plaintext contract)', async () => {
		const result = await checkMail(resolver(healthy), noFetch, 'Example.com.');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(formatMail(result.report)).toMatchInlineSnapshot(`
			"Domain: example.com
			MX: 10 mx.example.com
			MX: 20 backup.example.com
			SPF: v=spf1 include:_spf.example.net -all
			SPF lookups: 1/10
			DMARC: v=DMARC1; p=reject; rua=mailto:dmarc@example.com
			DKIM: google (checked google, selector1, selector2, default, k1, s1, s2, fm1, fm2, fm3, protonmail, zmail, mail, dkim)
			MTA-STS: (none)
			TLS-RPT: v=TLSRPTv1; rua=mailto:tls@example.com
			BIMI: (none)
			Issues: none found
			"
		`);
	});

	it('ignores revoked (empty p=) DKIM keys', async () => {
		const result = await checkMail(
			resolver({
				...healthy,
				'selector1._domainkey.example.com': { TXT: ['"v=DKIM1; p="'] }
			}),
			noFetch,
			'example.com'
		);
		expect(result.ok && result.report.dkimSelectors).toEqual(['google']);
	});

	it('flags missing SPF/DMARC and p=none', async () => {
		const result = await checkMail(
			resolver({
				'example.org': { MX: ['10 mx.example.org.'], TXT: [] },
				'_dmarc.example.org': { TXT: ['"v=DMARC1; p=none"'] }
			}),
			noFetch,
			'example.org'
		);
		expect(result.ok && result.report.issues).toEqual([
			'no SPF record: anyone can claim to send as this domain',
			'DMARC policy is p=none: monitoring only, spoofed mail is still delivered'
		]);
	});

	it('recognises a null MX and skips the SPF complaint', async () => {
		const result = await checkMail(
			resolver({
				'nomail.example': { MX: ['0 .'] },
				'_dmarc.nomail.example': { TXT: ['"v=DMARC1; p=reject"'] }
			}),
			noFetch,
			'nomail.example'
		);
		expect(result.ok && result.report.nullMx).toBe(true);
		expect(result.ok && result.report.issues).toEqual([]);
	});

	it('flags +all and too many lookups', async () => {
		const many = Array.from({ length: 11 }, (_, i) => `a:h${i}.example`).join(' ');
		const result = await checkMail(
			resolver({ 'busy.example': { MX: ['10 mx.busy.example.'], TXT: [`"v=spf1 ${many} +all"`] } }),
			noFetch,
			'busy.example'
		);
		expect(result.ok && result.report.issues.slice(0, 2)).toEqual([
			'SPF needs more than 10 DNS lookups: receivers fail it',
			'SPF ends in +all: it authorises every server'
		]);
	});

	it('rejects junk and passes NXDOMAIN through', async () => {
		expect(await checkMail(resolver({}), noFetch, 'not a domain')).toMatchObject({ status: 400 });
		expect(await checkMail(resolver({}), noFetch, 'missing.example')).toMatchObject({
			status: 404
		});
	});
});
