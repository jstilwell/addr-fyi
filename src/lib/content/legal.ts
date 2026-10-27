/**
 * Privacy and terms content — single source of truth, rendered as plaintext
 * for curl (via +server.ts) and as HTML for browsers (via +page.svelte).
 */

import { site } from '#lib/config/site.js';

export type LegalDoc = {
	title: string;
	updated: string;
	sections: Array<{ heading: string; body: string[] }>;
};

export const PRIVACY: LegalDoc = {
	title: 'Privacy',
	updated: '2026-10-27',
	sections: [
		{
			heading: 'The short version',
			body: [
				'addr.fyi has no accounts, no cookies, and no ads. There is nothing to sign up for and nothing tracking you between visits. The web pages count visits with Cloudflare Web Analytics, which is cookieless; the plaintext and JSON API is not tracked.'
			]
		},
		{
			heading: 'Analytics',
			body: [
				'Browser pages load Cloudflare Web Analytics, a privacy-focused script that records aggregate page views and performance (page, referrer, browser, country, load times). It sets no cookies, does not use local storage to identify you, does not fingerprint you, and is not used to track you across sites. Requests made with curl or other API clients never run it.'
			]
		},
		{
			heading: 'What the service sees',
			body: [
				'Like every web server, addr.fyi receives your IP address and request headers with each request — that is literally what the tool shows you. This data is used to answer your request and for standard operational logging at Cloudflare (error rates, latency, abuse detection), with short retention. It is not sold, shared, or used to build profiles.',
				'To keep usage fair, requests to the lookup tools are counted per IP address over a one-minute window; the counter is not stored beyond that.'
			]
		},
		{
			heading: 'Lookups you run',
			body: [
				'Queries you submit to the lookup tools are forwarded to third-party services to be answered: geolocation lookups to ip-api.com, WHOIS lookups to the authoritative RDAP registry (via rdap.org), DNS and mail checks to Cloudflare DNS-over-HTTPS (and, when you ask to compare resolvers, to Google, AdGuard and NextDNS too), routing lookups to RIPEstat, and certificate lookups to Cert Spotter or crt.sh. Only the query itself (the IP, domain, ASN or address you typed) is forwarded — not your identity.',
				"The http tool fetches the URL you give it from Cloudflare's network, identifying itself as addr.fyi; the site you name sees that request, not your IP. The mail tool likewise fetches a domain's MTA-STS policy file. The port tool opens a single TCP connection back to your own IP address, on the port you choose, and to nothing else. MAC lookups use a copy of the IEEE registry stored with the site, so the addresses you look up are not sent anywhere.",
				'The weather tool sends the approximate coordinates derived from your IP by Cloudflare to Open-Meteo (and, for US locations, to the National Weather Service for alerts).',
				'Lookup results are cached at the Cloudflare edge (from minutes for weather to a few hours for lookups) so repeated queries are fast; the cache stores the answer, not who asked.'
			]
		},
		{
			heading: 'Contact',
			body: [`Questions? Email ${site.email}.`]
		}
	]
};

export const TERMS: LegalDoc = {
	title: 'Terms of Service',
	updated: '2026-10-27',
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
				'Scripting against the plaintext API is encouraged — that is what it is for. Flooding it is not: keep automated usage reasonable, and expect rate limiting if you do not. Do not use the service for unlawful purposes or to facilitate abuse of the networks, registries and sites it queries.'
			]
		},
		{
			heading: 'Accuracy',
			body: [
				"Lookup results come from third-party sources (ip-api.com, RDAP registries, public DNS resolvers, RIPEstat, Certificate Transparency logs, the IEEE registry). Geolocation in particular is an estimate, and the http and port tools only show what Cloudflare's network could reach at that moment. No accuracy is guaranteed; do not rely on results for anything where being wrong matters."
			]
		},
		{
			heading: 'Changes',
			body: [
				'The service, these terms, and the API may change or be discontinued at any time. The API follows semantic versioning: breaking changes to plaintext output bump the major version, which every response reports in its X-Addr-Version header (curl -I addr.fyi). Changes are not otherwise announced.'
			]
		},
		{
			heading: 'Contact',
			body: [`Questions? Email ${site.email}.`]
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
