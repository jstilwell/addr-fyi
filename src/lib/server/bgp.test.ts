import { describe, expect, it } from 'vitest';
import { formatBgp, lookupBgp, type AsnRouting, type PrefixRouting } from './bgp';

/** Serve canned RIPEstat `data` payloads keyed by data call name. */
const ripestat = (calls: Record<string, unknown>) =>
	(async (url: string) => {
		const call = new URL(url).pathname.split('/')[2];
		return call in calls
			? Response.json({ data: calls[call] })
			: new Response('nope', { status: 500 });
	}) as unknown as typeof fetch;

describe('lookupBgp', () => {
	it('rejects input that is not an IP, prefix or ASN', async () => {
		expect(await lookupBgp(ripestat({}), 'example.com')).toMatchObject({ ok: false, status: 400 });
		expect(await lookupBgp(ripestat({}), '10.0.0.0/33')).toMatchObject({ ok: false, status: 400 });
	});

	it('looks up a prefix with its RPKI status', async () => {
		const result = await lookupBgp(
			ripestat({
				'prefix-overview': {
					announced: true,
					resource: '8.8.8.0/24',
					asns: [{ asn: 15169, holder: 'GOOGLE - Google LLC' }]
				},
				'rpki-validation': { status: 'valid' }
			}),
			'8.8.8.8'
		);
		expect(result).toMatchObject({ ok: true, routing: { prefix: '8.8.8.0/24', rpki: 'valid' } });
	});

	it('keeps the routing answer when RPKI fails', async () => {
		const result = await lookupBgp(
			ripestat({
				'prefix-overview': {
					announced: true,
					resource: '1.1.1.0/24',
					asns: [{ asn: 13335, holder: 'CF' }]
				}
			}),
			'1.1.1.1'
		);
		expect(result).toMatchObject({ ok: true, routing: { rpki: null } });
	});

	it('sorts an ASN prefix list numerically and picks top upstreams by power', async () => {
		const result = await lookupBgp(
			ripestat({
				'as-overview': { holder: 'EXAMPLE', announced: true },
				'announced-prefixes': {
					prefixes: [
						{ prefix: '10.2.0.0/16' },
						{ prefix: '2001:db8::/32' },
						{ prefix: '9.0.0.0/8' }
					]
				},
				'asn-neighbours': {
					neighbour_counts: { left: 2, right: 1, unique: 3 },
					neighbours: [
						{ asn: 1, type: 'left', power: 5 },
						{ asn: 2, type: 'left', power: 50 },
						{ asn: 3, type: 'right', power: 99 }
					]
				}
			}),
			'as64500'
		);
		expect(result).toMatchObject({
			ok: true,
			routing: { asn: 64500, ipv4Prefixes: ['9.0.0.0/8', '10.2.0.0/16'], topUpstreams: [2, 1] }
		});
	});

	it('reports an upstream failure as 502', async () => {
		expect(await lookupBgp(ripestat({}), 'AS1')).toMatchObject({ ok: false, status: 502 });
	});
});

describe('formatBgp (plaintext contract)', () => {
	it('renders an announced prefix', () => {
		const routing: PrefixRouting = {
			kind: 'prefix',
			query: '8.8.8.8',
			prefix: '8.8.8.0/24',
			announced: true,
			origins: [{ asn: 15169, holder: 'GOOGLE - Google LLC' }],
			rpki: 'valid',
			block: 'Administered by ARIN'
		};
		expect(formatBgp(routing)).toMatchInlineSnapshot(`
			"Query: 8.8.8.8
			Prefix: 8.8.8.0/24
			Announced: yes
			Origin: AS15169 GOOGLE - Google LLC
			RPKI: valid
			"
		`);
	});

	it('renders an unannounced address', () => {
		const routing: PrefixRouting = {
			kind: 'prefix',
			query: '10.0.0.1',
			prefix: null,
			announced: false,
			origins: [],
			rpki: null,
			block: 'IANA - Private Use (Status: RESERVED)'
		};
		expect(formatBgp(routing)).toMatchInlineSnapshot(`
			"Query: 10.0.0.1
			Announced: no — not visible in the global routing table
			Block: IANA - Private Use (Status: RESERVED)
			"
		`);
	});

	it('renders an ASN', () => {
		const routing: AsnRouting = {
			kind: 'asn',
			asn: 64500,
			holder: 'EXAMPLE-NET - Example Networks',
			announced: true,
			ipv4Prefixes: ['192.0.2.0/24'],
			ipv6Prefixes: ['2001:db8::/32'],
			neighbours: { total: 3, upstreamSide: 2, downstreamSide: 1 },
			topUpstreams: [64501, 64502]
		};
		expect(formatBgp(routing)).toMatchInlineSnapshot(`
			"ASN: AS64500
			Holder: EXAMPLE-NET - Example Networks
			Announced: yes
			Prefixes: 1 IPv4, 1 IPv6
			Neighbours: 3 (2 upstream-side, 1 downstream-side)
			Top upstream-side: AS64501, AS64502
			Prefix: 192.0.2.0/24
			Prefix: 2001:db8::/32
			"
		`);
	});
});
