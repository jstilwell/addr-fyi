import { describe, expect, it } from 'vitest';
import { formatMac, lookupMac, lookupMacWith, normaliseMac, parseRegistry } from './mac';

const registry = parseRegistry(
	[
		'001A2B\tAyecom Technology Co., Ltd.',
		'70B3D5\tIEEE Registration Authority',
		'70B3D5F01\tSoftware Systems Plus',
		'8C1F643\tExample MA-M Holder'
	].join('\n')
);

describe('normaliseMac', () => {
	it.each([
		['00:1a:2b:3c:4d:5e', '001A2B3C4D5E'],
		['00-1A-2B-3C-4D-5E', '001A2B3C4D5E'],
		['001a.2b3c.4d5e', '001A2B3C4D5E'],
		['001a2b', '001A2B']
	])('accepts %s', (input, hex) => {
		expect(normaliseMac(input)).toBe(hex);
	});

	it.each(['00:1a', 'zz:zz:zz', '00:1a:2b:3c:4d:5e:6f', ''])('rejects %s', (input) => {
		expect(normaliseMac(input)).toBeNull();
	});
});

describe('lookupMac', () => {
	it('prefers the most specific registry block', () => {
		expect(lookupMac(registry, '70:b3:d5:f0:12:34')).toMatchObject({
			ok: true,
			info: { vendor: 'Software Systems Plus', block: 'MA-S 70:B3:D5:F0:1' }
		});
		expect(lookupMac(registry, '8c:1f:64:3a:bc:de')).toMatchObject({
			info: { vendor: 'Example MA-M Holder', block: 'MA-M 8C:1F:64:3' }
		});
		expect(lookupMac(registry, '70:b3:d5:00:00:01')).toMatchObject({
			info: { vendor: 'IEEE Registration Authority', block: 'MA-L 70:B3:D5' }
		});
	});

	it('skips the registry for locally administered and reserved addresses', () => {
		expect(lookupMac(registry, 'da:a1:19:00:00:01')).toMatchObject({
			info: { vendor: null, locallyAdministered: true, special: null }
		});
		expect(lookupMac(registry, '33:33:00:00:00:01')).toMatchObject({
			info: { vendor: null, multicast: true, special: 'IPv6 multicast, RFC 2464' }
		});
	});
});

describe('lookupMacWith', () => {
	it('reports a missing table as 503 and retries the load next time', async () => {
		let calls = 0;
		const failing = async () => {
			calls++;
			return new Response('', { status: 404 });
		};
		expect(await lookupMacWith(failing, '00:1a:2b:3c:4d:5e')).toMatchObject({
			ok: false,
			status: 503
		});
		await lookupMacWith(failing, '00:1a:2b:3c:4d:5e');
		expect(calls).toBe(2);
	});

	it('validates input without loading the table', async () => {
		const never = async () => {
			throw new Error('should not load');
		};
		expect(await lookupMacWith(never, 'nope')).toMatchObject({ ok: false, status: 400 });
	});
});

describe('formatMac (plaintext contract)', () => {
	it('renders a vendor match', () => {
		const result = lookupMac(registry, '00:1a:2b:3c:4d:5e');
		expect(result.ok && formatMac(result.info)).toMatchInlineSnapshot(`
			"MAC: 00:1a:2b:3c:4d:5e
			Vendor: Ayecom Technology Co., Ltd.
			Block: MA-L 00:1A:2B
			Type: unicast, globally unique
			Source: IEEE Registration Authority
			"
		`);
	});

	it('renders a randomized address', () => {
		const result = lookupMac(registry, 'da:a1:19:00:00:01');
		expect(result.ok && formatMac(result.info)).toMatchInlineSnapshot(`
			"MAC: da:a1:19:00:00:01
			Vendor: none (locally administered, e.g. a randomized/private Wi-Fi address)
			Type: unicast, locally administered
			Source: IEEE Registration Authority
			"
		`);
	});
});
