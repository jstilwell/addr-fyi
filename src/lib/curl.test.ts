import { describe, expect, it } from 'vitest';
import { curlCommand } from './curl.js';

describe('curlCommand', () => {
	it('leaves plain URLs unquoted', () => {
		expect(curlCommand('addr.fyi/find/8.8.8.8')).toBe('curl addr.fyi/find/8.8.8.8');
		expect(curlCommand('addr.fyi/cidr/10.0.0.0/24')).toBe('curl addr.fyi/cidr/10.0.0.0/24');
		expect(curlCommand('localhost:5173/find/2001:db8::1')).toBe(
			'curl localhost:5173/find/2001:db8::1'
		);
	});

	it('quotes URLs a shell would glob or split', () => {
		expect(curlCommand('addr.fyi/dns/example.com?type=MX')).toBe(
			"curl 'addr.fyi/dns/example.com?type=MX'"
		);
		expect(curlCommand('addr.fyi/find/a&b')).toBe("curl 'addr.fyi/find/a&b'");
	});

	it('escapes single quotes inside a quoted URL', () => {
		expect(curlCommand("addr.fyi/find/it's")).toBe(`curl 'addr.fyi/find/it'\\''s'`);
	});

	it('puts flags before the URL', () => {
		expect(curlCommand('addr.fyi', '-I')).toBe('curl -I addr.fyi');
	});
});
