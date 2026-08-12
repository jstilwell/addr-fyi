/**
 * Privacy and terms content — single source of truth, rendered as plaintext
 * for curl (via +server.ts) and as HTML for browsers (via +page.svelte).
 */

export type LegalDoc = {
	title: string;
	updated: string;
	sections: Array<{ heading: string; body: string[] }>;
};

export const PRIVACY: LegalDoc = {
	title: 'Privacy',
	updated: '2026-08-12',
	sections: [
		{
			heading: 'The short version',
			body: [
				'addr.fyi has no accounts, no cookies, no analytics scripts, and no ads. There is nothing to sign up for and nothing tracking you between visits.'
			]
		},
		{
			heading: 'What the service sees',
			body: [
				'Like every web server, addr.fyi receives your IP address and request headers with each request — that is literally what the tool shows you. This data is used to answer your request and for standard operational logging at Cloudflare (error rates, latency, abuse detection), with short retention. It is not sold, shared, or used to build profiles.'
			]
		},
		{
			heading: 'Lookups you run',
			body: [
				'Queries you submit to the lookup tools are forwarded to third-party services to be answered: geolocation lookups to ip-api.com, WHOIS lookups to the authoritative RDAP registry (via rdap.org), and DNS lookups to Cloudflare DNS-over-HTTPS. Only the query itself (the IP, domain, or ASN you typed) is forwarded — not your identity.',
				'The weather tool sends the approximate coordinates derived from your IP by Cloudflare to Open-Meteo (and, for US locations, to the National Weather Service for alerts).',
				'Successful lookup results are cached at the Cloudflare edge for a few hours so repeated queries are fast; the cache stores the answer, not who asked.'
			]
		},
		{
			heading: 'Contact',
			body: ['Questions? Email jesse@stilwe.com.']
		}
	]
};

export const TERMS: LegalDoc = {
	title: 'Terms of Service',
	updated: '2026-08-12',
	sections: [
		{
			heading: 'The service',
			body: [
				'addr.fyi is a free network diagnostics tool: it shows you your IP address and runs simple lookups (geolocation, DNS, reverse DNS, WHOIS, subnet math). It is provided as-is, with no warranty and no uptime guarantee.'
			]
		},
		{
			heading: 'Fair use',
			body: [
				'Scripting against the plaintext API is encouraged — that is what it is for. Flooding it is not: keep automated usage reasonable, and expect rate limiting if you do not. Do not use the service for unlawful purposes or to facilitate abuse of the networks and registries it queries.'
			]
		},
		{
			heading: 'Accuracy',
			body: [
				'Lookup results come from third-party sources (ip-api.com, RDAP registries, Cloudflare DNS). Geolocation in particular is an estimate. No accuracy is guaranteed; do not rely on results for anything where being wrong matters.'
			]
		},
		{
			heading: 'Changes',
			body: [
				'The service, these terms, and the API may change or be discontinued at any time. Breaking changes to plaintext output are versioned (see the footer) but not otherwise announced.'
			]
		},
		{
			heading: 'Contact',
			body: ['Questions? Email jesse@stilwe.com.']
		}
	]
};

/** Render a legal doc the way curl should see it. */
export const legalPlaintext = (doc: LegalDoc): string => {
	const lines: string[] = [`${doc.title} — addr.fyi`, `Updated: ${doc.updated}`, ''];
	for (const section of doc.sections) {
		lines.push(`# ${section.heading}`, '');
		for (const paragraph of section.body) {
			lines.push(paragraph, '');
		}
	}
	return lines.join('\n');
};
