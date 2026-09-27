<script lang="ts">
	import { site } from '$lib/config/site';

	let { title, description, path }: { title: string; description: string; path: string } = $props();

	const canonical = $derived(site.url + (path === '/' ? '' : path));
	// Absolute, from the canonical origin: crawlers ignore relative og:image URLs.
	const ogImage = `${site.url}/og.png`;
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:site_name" content={site.name} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="addr.fyi — your IP address, plus quick network lookups" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>
