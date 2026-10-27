import { describe, expect, it } from 'vitest';
import type { DohResult, RecordType } from './dns';
import {
	auditSecurity,
	checkHttp,
	formatHttp,
	normaliseTarget,
	type HttpReport
} from './http-check';

/** DNS: every name resolves to `ip` unless listed in `zone`. */
const dns =
	(zone: Record<string, string> = {}, ip = '93.184.215.14') =>
	async (name: string, type: RecordType): Promise<DohResult> => ({
		ok: true,
		answers: type === 'A' ? [{ name, type: 'A', ttl: 60, data: zone[name] ?? ip }] : []
	});

/** HTTP: `routes[url]` is [status, headers]; anything else is a 404. */
const web = (routes: Record<string, [number, Record<string, string>?]>) => {
	const requested: string[] = [];
	const fetcher = (async (url: string) => {
		requested.push(url);
		const [status, headers] = routes[url] ?? [404];
		return new Response(status === 204 || (status >= 300 && status < 400) ? null : 'body', {
			status,
			headers
		});
	}) as unknown as typeof fetch;
	return { fetcher, requested };
};

const clock = () => {
	let t = 0;
	return () => (t += 10);
};

describe('normaliseTarget', () => {
	it.each([
		['example.com', 'https://example.com/'],
		['http://example.com/a?b=1', 'http://example.com/a?b=1'],
		['https:/example.com/x', 'https://example.com/x'],
		['example.com:8443/', 'https://example.com:8443/']
	])('%s → %s', (input, href) => {
		expect(normaliseTarget(input)?.href).toBe(href);
	});

	it.each(['ftp://example.com', 'ftp:/example.com', 'file:///etc/passwd', 'http://'])(
		'rejects %s',
		(input) => {
			expect(normaliseTarget(input)).toBeNull();
		}
	);
});

describe('checkHttp guards', () => {
	it.each([
		['localhost:8080', 'localhost is not reachable from here'],
		['http://127.0.0.1/', '127.0.0.1 is not a public address'],
		['http://[::1]/', '::1 is not a public address'],
		['https://addr.fyi/', "addr.fyi can't check itself"],
		['https://api.addr.fyi/', "addr.fyi can't check itself"],
		['https://user:pw@example.com/', 'URLs with credentials are not fetched']
	])('refuses %s', async (input, error) => {
		const { fetcher, requested } = web({});
		expect(await checkHttp(fetcher, dns(), input)).toEqual({ ok: false, error, status: 400 });
		expect(requested).toEqual([]);
	});

	it('refuses a host that resolves to a private address', async () => {
		const { fetcher, requested } = web({});
		const result = await checkHttp(
			fetcher,
			dns({ 'intranet.example': '10.1.2.3' }),
			'intranet.example'
		);
		expect(result).toMatchObject({
			ok: false,
			error: 'intranet.example resolves to a non-public address (10.1.2.3)'
		});
		expect(requested).toEqual([]);
	});

	it('refuses a redirect into private space before following it', async () => {
		const { fetcher, requested } = web({
			'https://example.com/': [302, { location: 'http://192.168.1.1/admin' }]
		});
		const result = await checkHttp(fetcher, dns(), 'example.com');
		expect(result).toMatchObject({ ok: false, error: '192.168.1.1 is not a public address' });
		expect(requested).toEqual(['https://example.com/']);
	});

	it('detects redirect loops', async () => {
		const { fetcher } = web({
			'https://a.example/': [301, { location: 'https://b.example/' }],
			'https://b.example/': [301, { location: 'https://a.example/' }]
		});
		expect(await checkHttp(fetcher, dns(), 'a.example')).toMatchObject({
			ok: false,
			error: 'redirect loop at https://a.example/'
		});
	});
});

describe('checkHttp', () => {
	it('follows relative redirects and reports the chain', async () => {
		const { fetcher } = web({
			'http://example.com/': [301, { location: 'https://example.com/' }],
			'https://example.com/': [302, { location: '/home' }],
			'https://example.com/home': [200, { 'content-type': 'text/html' }]
		});
		const result = await checkHttp(fetcher, dns(), 'http://example.com', clock());
		expect(result).toMatchObject({
			ok: true,
			report: {
				finalUrl: 'https://example.com/home',
				status: 200,
				httpsRedirect: true,
				totalMs: 30,
				hops: [{ status: 301 }, { status: 302 }, { status: 200, statusText: 'OK' }]
			}
		});
	});

	it('skips the security audit for a plain-HTTP final response', async () => {
		const { fetcher } = web({ 'http://example.com/': [200] });
		const result = await checkHttp(fetcher, dns(), 'http://example.com');
		expect(result).toMatchObject({ ok: true, report: { security: null, httpsRedirect: false } });
	});
});

describe('auditSecurity', () => {
	it('grades each header', () => {
		const checks = auditSecurity(
			new Headers({
				'strict-transport-security': 'max-age=300',
				'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
				'x-content-type-options': 'nosniff'
			})
		);
		expect(Object.fromEntries(checks.map((c) => [c.name, c.verdict]))).toEqual({
			'Strict-Transport-Security': 'weak',
			'Content-Security-Policy': 'ok',
			'X-Content-Type-Options': 'ok',
			'Frame protection': 'ok',
			'Referrer-Policy': 'missing',
			'Permissions-Policy': 'missing'
		});
	});
});

describe('formatHttp (plaintext contract)', () => {
	it('renders a report', () => {
		const report: HttpReport = {
			url: 'http://example.com/',
			hops: [
				{ url: 'http://example.com/', status: 301, statusText: 'Moved Permanently', ms: 41 },
				{ url: 'https://example.com/', status: 200, statusText: 'OK', ms: 198 }
			],
			finalUrl: 'https://example.com/',
			status: 200,
			statusText: 'OK',
			totalMs: 239,
			httpsRedirect: true,
			headers: [['content-type', 'text/html']],
			security: auditSecurity(
				new Headers({
					'strict-transport-security': 'max-age=31536000',
					'referrer-policy': 'no-referrer'
				})
			)
		};
		expect(formatHttp(report)).toMatchInlineSnapshot(`
			"Request: GET http://example.com/
			Hop 1: 301 Moved Permanently http://example.com/ (41 ms)
			Hop 2: 200 OK https://example.com/ (198 ms)
			Status: 200 OK
			Final URL: https://example.com/
			Time: 239 ms
			HTTPS redirect: yes
			Header: content-type: text/html
			Security headers: 2/6
			Security: Strict-Transport-Security: ok
			Security: Content-Security-Policy: missing
			Security: X-Content-Type-Options: missing
			Security: Frame protection: missing
			Security: Referrer-Policy: ok
			Security: Permissions-Policy: missing
			"
		`);
	});
});
