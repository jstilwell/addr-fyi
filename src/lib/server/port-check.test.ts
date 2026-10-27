import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPort, formatPort, isCloudflareIp, parsePort, type Connect } from './port-check';

/** A fake connect() whose `opened` settles however the test wants. */
const fakeConnect = (opened: () => Promise<unknown>) => {
	const calls: Array<{ hostname: string; port: number }> = [];
	const connect: Connect = (address) => {
		calls.push(address);
		return { opened: opened(), close: async () => {} };
	};
	return { connect, calls };
};

afterEach(() => {
	vi.useRealTimers();
});

describe('parsePort', () => {
	it.each([
		['22', 22],
		['65535', 65535],
		['0', null],
		['65536', null],
		['ssh', null],
		['-1', null],
		['', null]
	])('%s → %s', (input, port) => {
		expect(parsePort(input)).toBe(port);
	});
});

describe('isCloudflareIp', () => {
	it.each([
		['104.16.1.2', true],
		['162.159.36.1', true],
		['104.28.1.2', false],
		['2606:4700:4700::1111', true],
		['8.8.8.8', false],
		['2001:4860:4860::8888', false],
		['::1', false]
	])('%s → %s', (ip, expected) => {
		expect(isCloudflareIp(ip)).toBe(expected);
	});
});

describe('checkPort', () => {
	it('connects only to the caller and reports open', async () => {
		const { connect, calls } = fakeConnect(async () => {});
		const result = await checkPort(connect, '203.0.113.5', '22');
		expect(calls).toEqual([{ hostname: '203.0.113.5', port: 22 }]);
		expect(result).toMatchObject({ ok: true, check: { state: 'open' } });
	});

	it('reports a refusal as closed', async () => {
		const { connect } = fakeConnect(async () => {
			throw new Error('connect ECONNREFUSED 203.0.113.5:22');
		});
		expect(await checkPort(connect, '203.0.113.5', '22')).toMatchObject({
			check: { state: 'closed' }
		});
	});

	it('reads the Workers runtime refusal message as closed', async () => {
		const { connect } = fakeConnect(async () => {
			throw new Error('proxy request failed, cannot connect to the specified address');
		});
		expect(await checkPort(connect, '203.0.113.5', '22')).toMatchObject({
			check: { state: 'closed' }
		});
	});

	it('explains instead of connecting when the caller is inside Cloudflare', async () => {
		const { connect, calls } = fakeConnect(async () => {});
		const result = await checkPort(connect, '172.64.1.1', '22');
		expect(result).toMatchObject({ ok: false, status: 400 });
		expect(!result.ok && result.error).toContain("inside Cloudflare's network");
		expect(calls).toEqual([]);
	});

	it('reports other failures as errors with the reason', async () => {
		const { connect } = fakeConnect(async () => {
			throw new Error('Network connection lost');
		});
		expect(await checkPort(connect, '203.0.113.5', '22')).toMatchObject({
			check: { state: 'error', detail: 'the connection attempt failed (Network connection lost)' }
		});
	});

	it('reports silence as filtered after the timeout', async () => {
		vi.useFakeTimers();
		const { connect } = fakeConnect(() => new Promise(() => {}));
		const pending = checkPort(connect, '203.0.113.5', '22');
		await vi.advanceTimersByTimeAsync(5000);
		expect(await pending).toMatchObject({ check: { state: 'filtered', ms: null } });
	});

	it('refuses bad and blocked ports without connecting', async () => {
		const { connect, calls } = fakeConnect(async () => {});
		expect(await checkPort(connect, '203.0.113.5', '70000')).toMatchObject({ status: 400 });
		expect(await checkPort(connect, '203.0.113.5', '25')).toMatchObject({ status: 400 });
		expect(calls).toEqual([]);
	});
});

describe('formatPort (plaintext contract)', () => {
	it('renders a check', () => {
		expect(
			formatPort({
				ip: '203.0.113.5',
				port: 22,
				state: 'open',
				detail: 'accepted a TCP connection',
				ms: 31
			})
		).toMatchInlineSnapshot(`
			"IP: 203.0.113.5
			Port: 22
			State: open
			Detail: accepted a TCP connection
			Time: 31 ms
			"
		`);
	});
});
