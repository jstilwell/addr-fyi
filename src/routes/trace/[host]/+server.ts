import type { RequestHandler } from './$types';
import { negotiate } from '$lib/server/respond';

/**
 * Timed HTTP probes to a host from the Cloudflare edge serving this request.
 * Not a traceroute (Workers have no ICMP/raw sockets) — but paired with the
 * browser's probes to the edge, it brackets which path segment is slow.
 * HTTPS only, no path, and the body is discarded, so it can't proxy content.
 */

const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;
const ATTEMPTS = 3;

type Attempt = { ms: number; status: number | null };

const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

export const GET: RequestHandler = async ({ params, request, fetch, platform }) => {
	const host = params.host.trim().toLowerCase();
	if (!HOST_PATTERN.test(host) || !host.replace(/:\d+$/, '').includes('.')) {
		const error = 'invalid host (use a hostname like example.com, optionally with :port)';
		return negotiate(request, { error }, `Error: ${error}\n`, 400);
	}

	const url = `https://${host}/`;
	const colo = (platform?.cf?.colo as string) ?? 'edge';
	const attempts: Attempt[] = [];

	// Sequential on purpose: attempt 1 pays DNS + TLS setup, later attempts
	// may reuse the connection — the gap between them is itself informative.
	for (let i = 0; i < ATTEMPTS; i++) {
		const started = Date.now();
		try {
			const response = await fetch(url, {
				redirect: 'manual',
				signal: AbortSignal.timeout(5000)
			});
			attempts.push({ ms: Date.now() - started, status: response.status });
			await response.body?.cancel();
		} catch {
			attempts.push({ ms: Date.now() - started, status: null });
		}
	}

	const successes = attempts.filter((a) => a.status !== null).map((a) => a.ms);
	const fastestMs = successes.length ? Math.min(...successes) : null;
	const medianMs = successes.length ? median(successes) : null;

	const lines = [
		`Edge probe: ${url} from ${colo}`,
		...attempts.map(
			(a, i) =>
				`#${i + 1}: ${a.ms} ms ${a.status === null ? '(unreachable/timeout)' : `(HTTP ${a.status})`}`
		),
		fastestMs === null
			? 'Result: host unreachable from the edge'
			: `Fastest: ${fastestMs} ms | Median: ${medianMs} ms`,
		'Note: #1 includes DNS + TLS setup; later attempts may reuse the connection.'
	];

	return negotiate(
		request,
		{ target: url, colo, attempts, fastestMs, medianMs },
		lines.join('\n') + '\n',
		200,
		'no-store'
	);
};
