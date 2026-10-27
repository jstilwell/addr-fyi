import { describe, expect, it } from 'vitest';
import type { GeoSuccess } from './geo';
import { checkVpn, formatVpn, proxyHeaders, type VpnCheck } from './vpn';

const geo: GeoSuccess = {
	status: 'success',
	query: '185.65.134.1',
	country: 'Sweden',
	countryCode: 'SE',
	regionName: 'Stockholm',
	city: 'Stockholm',
	zip: '',
	lat: 59.33,
	lon: 18.06,
	timezone: 'Europe/Stockholm',
	isp: 'M247 Europe SRL',
	org: 'Example VPN',
	as: 'AS9009 M247 Europe SRL',
	reverse: '',
	proxy: false,
	hosting: false
};

/** Answer ip-api with `answer` and the Tor list with `exits` (null = Tor list down). */
const upstreams = (answer: Partial<GeoSuccess>, exits: string[] | null = ['1.2.3.4']) =>
	(async (url: string) => {
		if (url.startsWith('https://check.torproject.org/')) {
			return exits ? new Response(exits.join('\n') + '\n') : new Response('down', { status: 503 });
		}
		return Response.json({ ...geo, ...answer });
	}) as unknown as typeof fetch;

describe('checkVpn', () => {
	it('reports a clean residential address', async () => {
		const result = await checkVpn(upstreams({}), '185.65.134.1');
		expect(result).toMatchObject({
			ok: true,
			check: { verdict: 'none', tor: false, proxy: false, hosting: false, proxyHeaders: null }
		});
	});

	it('flags a Tor exit ahead of everything else', async () => {
		const result = await checkVpn(
			upstreams({ proxy: true, hosting: true }, ['1.2.3.4', '185.65.134.1']),
			'185.65.134.1'
		);
		expect(result).toMatchObject({ ok: true, check: { verdict: 'tor', tor: true } });
	});

	it("trusts ip-api's proxy flag over the hosting flag", async () => {
		const result = await checkVpn(upstreams({ proxy: true, hosting: true }), '185.65.134.1');
		expect(result).toMatchObject({ ok: true, check: { verdict: 'proxy' } });
	});

	it('calls a datacenter address a possible VPN', async () => {
		const result = await checkVpn(upstreams({ hosting: true }), '185.65.134.1');
		expect(result).toMatchObject({ ok: true, check: { verdict: 'hosting' } });
	});

	it('treats proxy headers on your own connection as a proxy', async () => {
		const result = await checkVpn(upstreams({}), '185.65.134.1', { via: '1.1 squid' });
		expect(result).toMatchObject({
			ok: true,
			check: { verdict: 'proxy', proxyHeaders: { via: '1.1 squid' } }
		});
	});

	it('keeps the answer when the Tor list is unavailable', async () => {
		const result = await checkVpn(upstreams({}, null), '185.65.134.1');
		expect(result).toMatchObject({ ok: true, check: { verdict: 'none', tor: null } });
	});

	it('leaves Tor unknown for IPv6 (the exit list is IPv4 only)', async () => {
		const result = await checkVpn(upstreams({ query: '2a03:1b20::1' }), '2a03:1b20::1');
		expect(result).toMatchObject({ ok: true, check: { tor: null } });
	});

	it('passes lookup failures through', async () => {
		const fail = (async () =>
			Response.json({ status: 'fail', message: 'reserved range' })) as unknown as typeof fetch;
		expect(await checkVpn(fail, '10.0.0.1')).toEqual({
			ok: false,
			error: 'reserved range',
			status: 400
		});
	});
});

describe('proxyHeaders', () => {
	it('picks out the headers a proxy adds, and nothing Cloudflare sets', () => {
		const headers = new Headers({
			via: '1.1 squid',
			'x-forwarded-for': '10.9.8.7',
			'x-real-ip': '185.65.134.1',
			'cf-connecting-ip': '185.65.134.1'
		});
		expect(proxyHeaders(headers)).toEqual({ via: '1.1 squid', 'x-forwarded-for': '10.9.8.7' });
	});
});

describe('formatVpn', () => {
	const check: VpnCheck = {
		ip: '185.65.134.1',
		verdict: 'hosting',
		tor: false,
		proxy: false,
		hosting: true,
		proxyHeaders: {},
		isp: 'M247 Europe SRL',
		as: 'AS9009 M247 Europe SRL',
		location: 'Stockholm, Sweden (SE)',
		timezone: 'Europe/Stockholm'
	};

	it('renders the plaintext contract', () => {
		expect(formatVpn(check)).toMatchInlineSnapshot(`
			"IP: 185.65.134.1
			Verdict: possibly a VPN — a datacenter address
			Tor exit: no
			VPN/proxy: no
			Datacenter: yes
			Proxy header: none
			ISP: M247 Europe SRL
			AS: AS9009 M247 Europe SRL
			Location: Stockholm, Sweden (SE)
			Timezone: Europe/Stockholm
			"
		`);
	});

	it('lists each proxy header, and omits the line for someone else’s IP', () => {
		expect(
			formatVpn({ ...check, proxyHeaders: { via: '1.1 squid', forwarded: 'for=10.9.8.7' } })
		).toContain('Proxy header: via: 1.1 squid\nProxy header: forwarded: for=10.9.8.7\n');
		expect(formatVpn({ ...check, proxyHeaders: null })).not.toContain('Proxy header');
		expect(formatVpn({ ...check, tor: null })).toContain('Tor exit: unknown');
	});
});
