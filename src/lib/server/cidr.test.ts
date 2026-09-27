import { describe, expect, it } from 'vitest';
import { calculateCidr, formatCidr } from './cidr';

describe('calculateCidr (IPv4)', () => {
	it('normalizes the address to its network and computes the range', () => {
		const info = calculateCidr('192.168.1.77/26');
		expect(info).toMatchObject({
			cidr: '192.168.1.64/26',
			network: '192.168.1.64',
			netmask: '255.255.255.192',
			wildcard: '0.0.0.63',
			broadcast: '192.168.1.127',
			firstHost: '192.168.1.65',
			lastHost: '192.168.1.126',
			hosts: '62',
			totalAddresses: '64'
		});
	});

	it('treats /31 as a two-host point-to-point link (RFC 3021)', () => {
		expect(calculateCidr('10.0.0.1/31')).toMatchObject({
			network: '10.0.0.0',
			broadcast: null,
			firstHost: '10.0.0.0',
			lastHost: '10.0.0.1',
			hosts: '2'
		});
	});

	it('treats /32 as a single host', () => {
		expect(calculateCidr('8.8.8.8/32')).toMatchObject({
			firstHost: '8.8.8.8',
			lastHost: '8.8.8.8',
			hosts: '1',
			totalAddresses: '1'
		});
	});

	it('handles /0', () => {
		expect(calculateCidr('1.2.3.4/0')).toMatchObject({
			cidr: '0.0.0.0/0',
			netmask: '0.0.0.0',
			broadcast: '255.255.255.255',
			totalAddresses: '4294967296'
		});
	});
});

describe('calculateCidr (IPv6)', () => {
	it('computes the network and last address', () => {
		expect(calculateCidr('2001:db8:abcd::1/48')).toMatchObject({
			cidr: '2001:db8:abcd::/48',
			version: 6,
			netmask: null,
			firstHost: '2001:db8:abcd::',
			lastHost: '2001:db8:abcd:ffff:ffff:ffff:ffff:ffff',
			totalAddresses: '1208925819614629174706176'
		});
	});

	it('handles ::/0 and /128', () => {
		expect(calculateCidr('::/0')?.lastHost).toBe('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
		expect(calculateCidr('::1/128')).toMatchObject({ cidr: '::1/128', totalAddresses: '1' });
	});
});

describe('calculateCidr (invalid input)', () => {
	it.each([
		'10.0.0.0',
		'10.0.0.0/',
		'10.0.0.0/33',
		'300.0.0.0/8',
		'10.0.0/8',
		'10.0.0.0/24/1',
		'10.0.0.0/-1',
		'::/129',
		'1::2::3/64',
		'example.com/24'
	])('rejects %s', (range) => {
		expect(calculateCidr(range)).toBeNull();
	});
});

describe('formatCidr', () => {
	it('renders the IPv4 plaintext contract', () => {
		expect(formatCidr(calculateCidr('10.0.0.0/24')!)).toMatchInlineSnapshot(`
			"CIDR: 10.0.0.0/24
			Network: 10.0.0.0
			Netmask: 255.255.255.0
			Wildcard: 0.0.0.255
			Broadcast: 10.0.0.255
			First host: 10.0.0.1
			Last host: 10.0.0.254
			Usable hosts: 254
			Total addresses: 256
			"
		`);
	});

	it('omits IPv4-only fields for IPv6', () => {
		expect(formatCidr(calculateCidr('2001:db8::/64')!)).toMatchInlineSnapshot(`
			"CIDR: 2001:db8::/64
			Network: 2001:db8::
			First host: 2001:db8::
			Last host: 2001:db8::ffff:ffff:ffff:ffff
			Usable hosts: 18446744073709551616
			Total addresses: 18446744073709551616
			"
		`);
	});
});
