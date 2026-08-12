import type { RequestHandler } from './$types';
import { negotiate } from '$lib/server/respond';
import { guardTraceHost } from '$lib/server/ssrf-guard';

/**
 * Timed HTTP probes to a host from the Cloudflare edge serving this request.
 * Not a traceroute (Workers have no ICMP/raw sockets) — but paired with the
 * browser's probes to the edge, it brackets which path segment is slow.
 *
 * SSRF surface: the host comes from the user, so guardTraceHost restricts it
 * to a public, DNS-named HTTPS host on port 443 and rejects anything that
 * resolves to private/reserved space. HTTPS only, no path, body discarded —
 * it cannot be used as a content proxy or to reach internal services.
 */

const ATTEMPTS = 3;

type Attempt = { ms: number; status: number | null };

const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

export const GET: RequestHandler = async ({ params, request, fetch, platform }) => {
	const guard = await guardTraceHost(fetch, params.host);
	if (!guard.ok) {
		return negotiate(request, { error: guard.error }, `Error: ${guard.error}\n`, guard.status);
	}

	const host = guard.host;
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
