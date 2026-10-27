/**
 * Certificates issued for a domain and its subdomains, from public Certificate
 * Transparency logs. Cert Spotter (SSLMate) is the primary source — fast, but
 * its keyless quota is per source IP, and Workers share egress IPs, so an
 * optional CERTSPOTTER_API_KEY secret lifts it. crt.sh is the fallback; it is
 * free but frequently overloaded. Results are cached for 6h.
 */

import { cacheJson, cacheKey, readCachedJson } from '#lib/server/cache.js';

const CERTSPOTTER = 'https://api.certspotter.com/v1/issuances';
const CRTSH = 'https://crt.sh/';
const CACHE_TTL_SECONDS = 21600;
/** Certificates listed in plaintext; the JSON keeps them all. */
const SHOWN_CERTS = 25;

export type Certificate = {
	names: string[];
	issuer: string;
	notBefore: string;
	notAfter: string;
};

export type CertReport = {
	domain: string;
	source: 'Cert Spotter' | 'crt.sh';
	/** Every distinct name on an unexpired certificate, sorted. */
	names: string[];
	/** Newest first. */
	certificates: Certificate[];
};

export type CertsResult =
	{ ok: true; report: CertReport } | { ok: false; error: string; status: number };

type SpotterIssuance = {
	dns_names: string[];
	issuer: { friendly_name?: string; name?: string };
	not_before: string;
	not_after: string;
};

type CrtShEntry = {
	name_value: string;
	issuer_name: string;
	not_before: string;
	not_after: string;
};

const fromCertSpotter = async (
	fetcher: typeof fetch,
	domain: string,
	apiKey?: string
): Promise<Omit<CertReport, 'domain' | 'names'> | null> => {
	const url = `${CERTSPOTTER}?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names&expand=issuer`;
	const response = await fetcher(url, {
		headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
		signal: AbortSignal.timeout(8000)
	});
	if (!response.ok) return null; // 429 (quota) and friends: let crt.sh try
	const issuances = (await response.json()) as SpotterIssuance[];
	return {
		source: 'Cert Spotter',
		certificates: issuances.map((i) => ({
			names: i.dns_names,
			issuer: i.issuer.friendly_name ?? i.issuer.name ?? 'unknown',
			notBefore: i.not_before.slice(0, 10),
			notAfter: i.not_after.slice(0, 10)
		}))
	};
};

const fromCrtSh = async (
	fetcher: typeof fetch,
	domain: string
): Promise<Omit<CertReport, 'domain' | 'names'> | null> => {
	const url = `${CRTSH}?q=${encodeURIComponent(domain)}&output=json&exclude=expired`;
	const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
	if (!response.ok) return null;
	const entries = (await response.json()) as CrtShEntry[];
	return {
		source: 'crt.sh',
		certificates: entries.map((e) => ({
			names: e.name_value.split('\n'),
			// "C=US, O=Let's Encrypt, CN=R11" → "Let's Encrypt"
			issuer: e.issuer_name.match(/O=("[^"]+"|[^,]+)/)?.[1].replace(/"/g, '') ?? e.issuer_name,
			notBefore: e.not_before.slice(0, 10),
			notAfter: e.not_after.slice(0, 10)
		}))
	};
};

export const lookupCerts = async (
	fetcher: typeof fetch,
	input: string,
	apiKey?: string
): Promise<CertsResult> => {
	const domain = input.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
	if (!/^([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(domain)) {
		return { ok: false, error: 'invalid domain name', status: 400 };
	}

	const key = cacheKey(`certs/${domain}`);
	const stored = await readCachedJson<CertReport>(key);
	if (stored) return { ok: true, report: stored };

	let found: Omit<CertReport, 'domain' | 'names'> | null = null;
	for (const source of [
		() => fromCertSpotter(fetcher, domain, apiKey),
		() => fromCrtSh(fetcher, domain)
	]) {
		try {
			found = await source();
		} catch {
			found = null; // timeout or bad JSON: try the next source
		}
		if (found) break;
	}
	if (!found) {
		return {
			ok: false,
			error:
				'certificate transparency sources unavailable (Cert Spotter and crt.sh) — try again later',
			status: 503
		};
	}

	const certificates = found.certificates.sort((a, b) => b.notBefore.localeCompare(a.notBefore));
	const report: CertReport = {
		domain,
		...found,
		certificates,
		names: [...new Set(certificates.flatMap((c) => c.names.map((n) => n.toLowerCase())))].sort()
	};
	cacheJson(key, report, CACHE_TTL_SECONDS);
	return { ok: true, report };
};

export const formatCerts = (r: CertReport): string => {
	const lines = [
		`Domain: ${r.domain}`,
		`Source: ${r.source}`,
		`Certificates: ${r.certificates.length}`,
		`Names: ${r.names.length}`,
		...r.names.map((n) => `Name: ${n}`)
	];
	for (const c of r.certificates.slice(0, SHOWN_CERTS)) {
		const names =
			c.names.length > 3
				? `${c.names.slice(0, 3).join(', ')} +${c.names.length - 3} more`
				: c.names.join(', ');
		lines.push(`Cert: ${c.notBefore} to ${c.notAfter}  ${c.issuer}  ${names}`);
	}
	if (r.certificates.length > SHOWN_CERTS) {
		lines.push(
			`(${r.certificates.length - SHOWN_CERTS} older certificates omitted; JSON has them all)`
		);
	}
	return lines.join('\n') + '\n';
};
