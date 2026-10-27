/**
 * HTTP check from the edge: follows a URL's redirect chain hop by hop, then
 * reports the final status, response headers, timing and a security-header
 * audit. Bodies are never read or returned, so it's useless as a proxy.
 *
 * Every hop is vetted before it's fetched: no credentials, no localhost, no
 * addr.fyi (loops), and no host that is — or resolves to — a non-public
 * address. Workers egress can't reach private networks anyway; the checks
 * also cover `vite dev`, where Node can.
 */

import { site } from '#lib/config/site.js';
import { convertIp } from '#lib/server/convert.js';
import type { DohResult, RecordType } from '#lib/server/dns.js';

export type Lookup = (name: string, type: RecordType) => Promise<DohResult>;

export type Hop = {
	url: string;
	status: number;
	statusText: string;
	ms: number;
};

export type SecurityCheck = {
	name: string;
	verdict: 'ok' | 'weak' | 'missing';
	value: string | null;
};

export type HttpReport = {
	url: string;
	hops: Hop[];
	finalUrl: string;
	status: number;
	statusText: string;
	totalMs: number;
	/** For http:// requests: whether the chain ended on https://. */
	httpsRedirect: boolean | null;
	headers: Array<[string, string]>;
	/** Only audited when the final response came over HTTPS. */
	security: SecurityCheck[] | null;
};

export type HttpResult =
	{ ok: true; report: HttpReport } | { ok: false; error: string; status: number };

const MAX_HOPS = 10;
const HOP_TIMEOUT_MS = 8000;
/** HSTS shorter than ~6 months is commonly flagged as too short to matter. */
const HSTS_MIN_SECONDS = 15552000;

const STATUS_TEXT: Record<number, string> = {
	200: 'OK',
	201: 'Created',
	204: 'No Content',
	301: 'Moved Permanently',
	302: 'Found',
	303: 'See Other',
	304: 'Not Modified',
	307: 'Temporary Redirect',
	308: 'Permanent Redirect',
	400: 'Bad Request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not Found',
	405: 'Method Not Allowed',
	410: 'Gone',
	429: 'Too Many Requests',
	500: 'Internal Server Error',
	502: 'Bad Gateway',
	503: 'Service Unavailable',
	504: 'Gateway Timeout'
};

const PUBLIC_SCOPES = new Set(['public', 'global unicast']);

class Refused extends Error {}

/** Turn the path tail into a URL: default to https://, repair `https:/host` from collapsed slashes. */
export const normaliseTarget = (input: string): URL | null => {
	const text = input.trim().replace(/^(https?):\/*/i, '$1://');
	// Any other scheme (ftp://, file://; the path may arrive with its // collapsed)
	// is refused, not read as a hostname.
	if (/^[a-z][a-z0-9+.-]*:\/+/i.test(text) && !/^https?:\/\//i.test(text)) return null;
	try {
		const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
	} catch {
		return null;
	}
};

const isPublicIp = (ip: string) => {
	const conversion = convertIp(ip);
	return conversion !== null && PUBLIC_SCOPES.has(conversion.scope);
};

/** Throws Refused unless `url` may be fetched. */
const vet = async (url: URL, lookup: Lookup): Promise<void> => {
	if (url.username || url.password) throw new Refused('URLs with credentials are not fetched');
	const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	const self = new URL(site.url).hostname;
	if (host === self || host.endsWith(`.${self}`)) throw new Refused(`${self} can't check itself`);
	if (host === 'localhost' || host.endsWith('.localhost')) {
		throw new Refused('localhost is not reachable from here');
	}
	if (convertIp(host)) {
		if (!isPublicIp(host)) throw new Refused(`${host} is not a public address`);
		return;
	}
	const answers = await Promise.all(
		(['A', 'AAAA'] as const).map(async (type) => {
			const result = await lookup(host, type);
			return result.ok ? result.answers.filter((a) => a.type === type).map((a) => a.data) : [];
		})
	);
	const addresses = answers.flat();
	if (addresses.length === 0) throw new Refused(`could not resolve ${host}`);
	const internal = addresses.find((ip) => !isPublicIp(ip));
	if (internal) throw new Refused(`${host} resolves to a non-public address (${internal})`);
};

export const auditSecurity = (headers: Headers): SecurityCheck[] => {
	const get = (name: string) => headers.get(name);
	const check = (name: string, value: string | null, ok = value !== null): SecurityCheck => ({
		name,
		value,
		verdict: value === null ? 'missing' : ok ? 'ok' : 'weak'
	});

	const hsts = get('strict-transport-security');
	const maxAge = Number(hsts?.match(/max-age\s*=\s*"?(\d+)/i)?.[1] ?? 0);
	const csp = get('content-security-policy');
	const xfo = get('x-frame-options');
	const frameAncestors = csp?.match(/frame-ancestors[^;]*/i)?.[0] ?? null;

	return [
		check('Strict-Transport-Security', hsts, maxAge >= HSTS_MIN_SECONDS),
		check('Content-Security-Policy', csp),
		check(
			'X-Content-Type-Options',
			get('x-content-type-options'),
			/nosniff/i.test(get('x-content-type-options') ?? '')
		),
		check('Frame protection', xfo ?? frameAncestors),
		check('Referrer-Policy', get('referrer-policy')),
		check('Permissions-Policy', get('permissions-policy'))
	];
};

export const checkHttp = async (
	fetcher: typeof fetch,
	lookup: Lookup,
	input: string,
	now: () => number = Date.now
): Promise<HttpResult> => {
	const start = normaliseTarget(input);
	if (!start)
		return {
			ok: false,
			error: 'invalid URL (e.g. example.com or https://example.com/path)',
			status: 400
		};

	const hops: Hop[] = [];
	const seen = new Set<string>();
	let url = start;
	let response: Response | null = null;

	try {
		while (hops.length < MAX_HOPS) {
			if (seen.has(url.href)) throw new Refused(`redirect loop at ${url.href}`);
			seen.add(url.href);
			await vet(url, lookup);

			const started = now();
			response = await fetcher(url.href, {
				redirect: 'manual',
				headers: { 'user-agent': `addr.fyi/${site.version} (+${site.url})`, accept: '*/*' },
				signal: AbortSignal.timeout(HOP_TIMEOUT_MS)
			});
			const ms = now() - started;
			await response.body?.cancel();
			hops.push({
				url: url.href,
				status: response.status,
				statusText: STATUS_TEXT[response.status] ?? '',
				ms
			});

			const location = response.headers.get('location');
			if (response.status < 300 || response.status >= 400 || !location) break;
			url = new URL(location, url);
			if (url.protocol !== 'http:' && url.protocol !== 'https:') {
				throw new Refused(`redirects to a non-HTTP URL (${url.protocol})`);
			}
		}
	} catch (err) {
		if (err instanceof Refused) return { ok: false, error: err.message, status: 400 };
		const detail = err instanceof Error ? err.message : String(err);
		const timeout = err instanceof Error && err.name === 'TimeoutError';
		return {
			ok: false,
			error: timeout
				? `${url.href} did not respond within ${HOP_TIMEOUT_MS / 1000}s`
				: `request to ${url.href} failed (${detail})`,
			status: 502
		};
	}

	const last = hops[hops.length - 1];
	if (!response || !last) return { ok: false, error: 'no response', status: 502 };
	if (hops.length === MAX_HOPS && last.status >= 300 && last.status < 400) {
		return { ok: false, error: `more than ${MAX_HOPS} redirects`, status: 400 };
	}

	const finalUrl = new URL(last.url);
	return {
		ok: true,
		report: {
			url: start.href,
			hops,
			finalUrl: last.url,
			status: last.status,
			statusText: last.statusText,
			totalMs: hops.reduce((sum, h) => sum + h.ms, 0),
			httpsRedirect: start.protocol === 'http:' ? finalUrl.protocol === 'https:' : null,
			headers: [...response.headers],
			security: finalUrl.protocol === 'https:' ? auditSecurity(response.headers) : null
		}
	};
};

export const formatHttp = (r: HttpReport): string => {
	const lines = [`Request: GET ${r.url}`];
	r.hops.forEach((h, i) => {
		lines.push(
			`Hop ${i + 1}: ${h.status}${h.statusText ? ` ${h.statusText}` : ''} ${h.url} (${h.ms} ms)`
		);
	});
	lines.push(`Status: ${r.status}${r.statusText ? ` ${r.statusText}` : ''}`);
	lines.push(`Final URL: ${r.finalUrl}`);
	lines.push(`Time: ${r.totalMs} ms`);
	if (r.httpsRedirect !== null) lines.push(`HTTPS redirect: ${r.httpsRedirect ? 'yes' : 'no'}`);
	lines.push(...r.headers.map(([name, value]) => `Header: ${name}: ${value}`));
	if (r.security) {
		const passed = r.security.filter((s) => s.verdict === 'ok').length;
		lines.push(`Security headers: ${passed}/${r.security.length}`);
		lines.push(...r.security.map((s) => `Security: ${s.name}: ${s.verdict}`));
	} else {
		lines.push('Security headers: not audited (final response is plain HTTP)');
	}
	return lines.join('\n') + '\n';
};
