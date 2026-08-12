/** Canonical site config — the single source of truth for SEO and sitemaps. */

export const site = {
	name: 'addr.fyi',
	/** Canonical origin. Never derive absolute URLs from the request origin —
	 * the deployed Worker sees http:// and that poisons canonicalization. */
	url: 'https://addr.fyi',
	description: 'Your IP address and quick network lookups. curl-friendly.',
	email: 'contact@addr.fyi',
	version: __APP_VERSION__
};

/**
 * Every HTML page on the site. ADD NEW PAGES HERE when you create them —
 * this list drives both /sitemap (human-readable) and /sitemap.xml
 * (crawlers); a page missing from it is invisible to search engines.
 */
export const PAGES: Array<{ path: string; name: string; blurb: string }> = [
	{ path: '/', name: 'home', blurb: 'your IP address and all the lookup tools' },
	{ path: '/sitemap', name: 'sitemap', blurb: 'every page on the site' },
	{ path: '/privacy', name: 'privacy', blurb: 'what this service does (and does not) collect' },
	{ path: '/terms', name: 'terms', blurb: 'terms of service, briefly' }
];
