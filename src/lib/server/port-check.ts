/**
 * "Is my port open from the internet?" — the edge opens one TCP connection
 * back to the caller's own IP on the requested port. Deliberately has no way
 * to name another host, so it can't be used to scan anyone else.
 * The connect function is injected (cloudflare:sockets in production).
 */

import { convertIp } from '#lib/server/convert.js';

export type Connect = (address: { hostname: string; port: number }) => {
	opened: Promise<unknown>;
	close: () => Promise<void>;
};

export type PortState = 'open' | 'closed' | 'filtered' | 'error';

export type PortCheck = {
	ip: string;
	port: number;
	state: PortState;
	detail: string;
	ms: number | null;
};

export type PortResult =
	{ ok: true; check: PortCheck } | { ok: false; error: string; status: number };

const TIMEOUT_MS = 5000;

/** Workers refuse outbound SMTP outright, so testing it would only mislead. */
const BLOCKED_PORTS = new Set([25]);

/**
 * Cloudflare's published ranges (https://www.cloudflare.com/ips/). Workers
 * sockets can't connect into them, so a caller arriving from one (e.g. via a
 * Cloudflare proxy) would see every port wrongly read as closed.
 */
const CLOUDFLARE_RANGES = [
	'173.245.48.0/20',
	'103.21.244.0/22',
	'103.22.200.0/22',
	'103.31.4.0/22',
	'141.101.64.0/18',
	'108.162.192.0/18',
	'190.93.240.0/20',
	'188.114.96.0/20',
	'197.234.240.0/22',
	'198.41.128.0/17',
	'162.158.0.0/15',
	'104.16.0.0/13',
	'104.24.0.0/14',
	'172.64.0.0/13',
	'131.0.72.0/22',
	'2400:cb00::/32',
	'2606:4700::/32',
	'2803:f800::/32',
	'2405:b500::/32',
	'2405:8100::/32',
	'2a06:98c0::/29',
	'2c0f:f248::/32'
];

export const isCloudflareIp = (ip: string): boolean => {
	const target = convertIp(ip);
	if (!target) return false;
	return CLOUDFLARE_RANGES.some((range) => {
		const [network, length] = range.split('/');
		const net = convertIp(network)!;
		if (net.version !== target.version) return false;
		const shift = BigInt((target.version === 4 ? 32 : 128) - Number(length));
		return BigInt(target.decimal) >> shift === BigInt(net.decimal) >> shift;
	});
};

const DETAIL: Record<PortState, string> = {
	open: 'accepted a TCP connection',
	closed: 'connection refused — nothing is listening, or a firewall rejected it',
	filtered: `no reply within ${TIMEOUT_MS / 1000}s — a firewall or NAT is dropping it`,
	error: 'the connection attempt failed'
};

export const parsePort = (input: string): number | null => {
	if (!/^\d{1,5}$/.test(input)) return null;
	const port = Number(input);
	return port >= 1 && port <= 65535 ? port : null;
};

export const checkPort = async (
	connect: Connect,
	ip: string,
	input: string,
	now: () => number = Date.now
): Promise<PortResult> => {
	const port = parsePort(input);
	if (port === null) return { ok: false, error: 'invalid port (use 1-65535)', status: 400 };
	if (BLOCKED_PORTS.has(port)) {
		return {
			ok: false,
			error: `port ${port} can't be tested: Cloudflare Workers block outbound connections to it`,
			status: 400
		};
	}

	if (isCloudflareIp(ip)) {
		return {
			ok: false,
			error: `your IP (${ip}) is inside Cloudflare's network, which Workers can't open connections to, so its ports can't be tested from here`,
			status: 400
		};
	}

	const started = now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<'timeout'>((resolve) => {
		timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS);
	});

	let state: PortState;
	let detail: string;
	let socket: ReturnType<Connect> | undefined;
	try {
		socket = connect({ hostname: ip, port });
		const outcome = await Promise.race([socket.opened.then(() => 'open' as const), timeout]);
		state = outcome === 'open' ? 'open' : 'filtered';
		detail = DETAIL[state];
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// workerd reports a refused connection as "cannot connect to the specified address".
		state = /refused|reset|cannot connect to the specified address/i.test(message)
			? 'closed'
			: 'error';
		detail = state === 'closed' ? DETAIL.closed : `${DETAIL.error} (${message})`;
	} finally {
		clearTimeout(timer);
		// Close in the background; a half-open socket must not hold the response.
		socket?.close().catch(() => {});
	}

	return {
		ok: true,
		check: {
			ip,
			port,
			state,
			detail,
			ms: state === 'open' || state === 'closed' ? now() - started : null
		}
	};
};

export const formatPort = (c: PortCheck): string =>
	[
		`IP: ${c.ip}`,
		`Port: ${c.port}`,
		`State: ${c.state}`,
		`Detail: ${c.detail}`,
		...(c.ms === null ? [] : [`Time: ${c.ms} ms`])
	].join('\n') + '\n';
