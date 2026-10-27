import { describe, expect, it } from 'vitest';
import { formatCerts, lookupCerts, type CertReport } from './certs';

const spotter = [
	{
		dns_names: ['example.com', 'www.example.com'],
		issuer: { friendly_name: 'DigiCert' },
		not_before: '2026-01-15T00:00:00Z',
		not_after: '2027-01-15T23:59:59Z'
	},
	{
		dns_names: ['*.example.com'],
		issuer: { name: "C=US, O=Let's Encrypt, CN=R11" },
		not_before: '2026-09-01T00:00:00Z',
		not_after: '2026-11-30T00:00:00Z'
	}
];

const crtsh = [
	{
		name_value: 'example.com\nmail.example.com',
		issuer_name: 'C=US, O="Let\'s Encrypt", CN=R10',
		not_before: '2026-08-01T00:00:00',
		not_after: '2026-10-30T00:00:00'
	}
];

/** Route by host: each source is a body, a status code, or a thrown error. */
const sources = (spotterReply: unknown, crtshReply: unknown) =>
	(async (url: string) => {
		const reply = url.includes('certspotter') ? spotterReply : crtshReply;
		if (reply instanceof Error) throw reply;
		return typeof reply === 'number' ? new Response('', { status: reply }) : Response.json(reply);
	}) as unknown as typeof fetch;

describe('lookupCerts', () => {
	it('uses Cert Spotter, newest certificate first, names deduplicated', async () => {
		const result = await lookupCerts(sources(spotter, 500), 'Example.com');
		expect(result).toMatchObject({
			ok: true,
			report: {
				source: 'Cert Spotter',
				names: ['*.example.com', 'example.com', 'www.example.com'],
				certificates: [{ issuer: "C=US, O=Let's Encrypt, CN=R11" }, { issuer: 'DigiCert' }]
			}
		});
	});

	it('falls back to crt.sh when Cert Spotter is over quota', async () => {
		const result = await lookupCerts(sources(429, crtsh), 'example.com');
		expect(result).toMatchObject({
			ok: true,
			report: {
				source: 'crt.sh',
				names: ['example.com', 'mail.example.com'],
				certificates: [{ issuer: "Let's Encrypt", notBefore: '2026-08-01' }]
			}
		});
	});

	it('reports 503 when both sources fail', async () => {
		const result = await lookupCerts(sources(new Error('timeout'), 502), 'example.com');
		expect(result).toMatchObject({ ok: false, status: 503 });
	});

	it('rejects junk', async () => {
		expect(await lookupCerts(sources([], []), 'not a domain')).toMatchObject({ status: 400 });
	});
});

describe('formatCerts (plaintext contract)', () => {
	it('renders a report', () => {
		const report: CertReport = {
			domain: 'example.com',
			source: 'Cert Spotter',
			names: ['example.com', 'www.example.com'],
			certificates: [
				{
					names: ['example.com', 'www.example.com', 'a.example.com', 'b.example.com'],
					issuer: 'DigiCert',
					notBefore: '2026-01-15',
					notAfter: '2027-01-15'
				}
			]
		};
		expect(formatCerts(report)).toMatchInlineSnapshot(`
			"Domain: example.com
			Source: Cert Spotter
			Certificates: 1
			Names: 2
			Name: example.com
			Name: www.example.com
			Cert: 2026-01-15 to 2027-01-15  DigiCert  example.com, www.example.com, a.example.com +1 more
			"
		`);
	});
});
