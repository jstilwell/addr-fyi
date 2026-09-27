import { describe, expect, it } from 'vitest';
import { expandIpv6, isRecordType, toArpaName } from './dns';

describe('expandIpv6', () => {
	it('expands compressed forms', () => {
		expect(expandIpv6('::1')).toEqual([
			'0000',
			'0000',
			'0000',
			'0000',
			'0000',
			'0000',
			'0000',
			'0001'
		]);
		expect(expandIpv6('2001:DB8::')).toEqual([
			'2001',
			'0db8',
			'0000',
			'0000',
			'0000',
			'0000',
			'0000',
			'0000'
		]);
		expect(expandIpv6('::')).toHaveLength(8);
	});

	it.each(['1::2::3', ':::', 'g::1', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '12345::'])(
		'rejects %s',
		(ip) => {
			expect(expandIpv6(ip)).toBeNull();
		}
	);
});

describe('toArpaName', () => {
	it('reverses IPv4 octets', () => {
		expect(toArpaName('8.8.4.4')).toBe('4.4.8.8.in-addr.arpa');
	});

	it('reverses IPv6 nibbles', () => {
		expect(toArpaName('2001:db8::1')).toBe(
			'1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
		);
	});

	it.each(['256.1.1.1', '1.2.3', 'example.com', '1.2.3.4.5', ''])('rejects %s', (ip) => {
		expect(toArpaName(ip)).toBeNull();
	});
});

describe('isRecordType', () => {
	it('accepts supported types only', () => {
		expect(isRecordType('MX')).toBe(true);
		expect(isRecordType('mx')).toBe(false);
		expect(isRecordType('ANY')).toBe(false);
	});
});
