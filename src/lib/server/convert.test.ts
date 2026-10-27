import { describe, expect, it } from 'vitest';
import { convertIp, formatConversion } from './convert';

describe('convertIp', () => {
	it('converts dotted IPv4', () => {
		expect(convertIp('8.8.8.8')).toMatchObject({
			ip: '8.8.8.8',
			version: 4,
			scope: 'public',
			decimal: '134744072',
			hex: '0x08080808',
			binary: '00001000.00001000.00001000.00001000',
			ipv4Mapped: '::ffff:8.8.8.8',
			reverseDns: '8.8.8.8.in-addr.arpa'
		});
	});

	it('accepts decimal and hex input', () => {
		expect(convertIp('134744072')?.ip).toBe('8.8.8.8');
		expect(convertIp('0x08080808')?.ip).toBe('8.8.8.8');
		expect(convertIp('0x20010db8000000000000000000000001')?.ip).toBe('2001:db8::1');
	});

	it.each([
		['10.1.2.3', 'private (RFC 1918)'],
		['100.64.0.1', 'shared address space / CGNAT (RFC 6598)'],
		['127.0.0.1', 'loopback'],
		['192.0.2.7', 'documentation (TEST-NET-1)'],
		['255.255.255.255', 'limited broadcast'],
		['::1', 'loopback'],
		['fd12:3456::1', 'unique local (RFC 4193)'],
		['fe80::1', 'link-local'],
		['2606:4700::1111', 'global unicast']
	])('classifies %s as %s', (ip, scope) => {
		expect(convertIp(ip)?.scope).toBe(scope);
	});

	it('normalises IPv6 and finds embedded IPv4', () => {
		const mapped = convertIp('::FFFF:192.0.2.1')!;
		expect(mapped.ip).toBe('::ffff:c000:201');
		expect(mapped.embeddedIpv4).toBe('192.0.2.1');
		expect(convertIp('2002:c000:0201::1')?.embeddedIpv4).toBe('192.0.2.1');
		expect(convertIp('64:ff9b::808:808')?.embeddedIpv4).toBe('8.8.8.8');
	});

	it.each(['256.1.1.1', '1.2.3', 'example.com', '1::2::3', '0xZZ', '-1', ''])(
		'rejects %s',
		(input) => {
			expect(convertIp(input)).toBeNull();
		}
	);
});

describe('formatConversion', () => {
	it('renders IPv4 (plaintext contract)', () => {
		expect(formatConversion(convertIp('8.8.8.8')!)).toMatchInlineSnapshot(`
			"IP: 8.8.8.8
			Version: IPv4
			Scope: public
			Decimal: 134744072
			Hex: 0x08080808
			Binary: 00001000.00001000.00001000.00001000
			IPv4-mapped IPv6: ::ffff:8.8.8.8
			Reverse DNS: 8.8.8.8.in-addr.arpa
			"
		`);
	});

	it('renders IPv6 (plaintext contract)', () => {
		expect(formatConversion(convertIp('2001:db8::1')!)).toMatchInlineSnapshot(`
			"IP: 2001:db8::1
			Version: IPv6
			Scope: documentation (RFC 3849)
			Expanded: 2001:0db8:0000:0000:0000:0000:0000:0001
			Decimal: 42540766411282592856903984951653826561
			Hex: 0x20010db8000000000000000000000001
			Reverse DNS: 1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa
			"
		`);
	});
});
