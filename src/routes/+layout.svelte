<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import Mail from '@lucide/svelte/icons/mail';
	import Terminal from '@lucide/svelte/icons/terminal';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { site } from '$lib/config/site';

	let { children } = $props();

	const year = new Date().getFullYear();

	// Terminal-prompt favicon (">_"), drawn to match the header glyph and the
	// site's steel-blue accent — a rounded dark tile with a chevron + cursor
	// bar. Self-contained inline SVG, crisp at any size, no asset file.
	const favicon =
		'data:image/svg+xml,' +
		encodeURIComponent(
			[
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
				'<rect width="100" height="100" rx="22" fill="#1e2430"/>',
				'<path d="M28 34 L48 50 L28 66" fill="none" stroke="#7aa0e0"',
				' stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>',
				'<rect x="54" y="60" width="24" height="8" rx="4" fill="#7aa0e0"/>',
				'</svg>'
			].join('')
		);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#f7f8fa" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#25292f" media="(prefers-color-scheme: dark)" />
</svelte:head>

<div class="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
	<header class="flex items-center justify-between">
		<a
			href={resolve('/')}
			class="flex items-center gap-2 text-lg font-bold tracking-tight"
			aria-label="addr.fyi home"
		>
			<Terminal class="text-primary size-5" aria-hidden="true" />
			<span>addr.fyi</span><span class="cursor-blink text-primary -ml-1">▊</span>
		</a>
		<ThemeToggle />
	</header>

	{@render children?.()}

	<footer class="text-muted-foreground mt-auto flex flex-col gap-2 text-xs">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<span>addr-fyi ({site.version})</span>
			<a href={resolve('/privacy')} class="hover:text-foreground transition-colors">privacy</a>
			<a href={resolve('/terms')} class="hover:text-foreground transition-colors">terms</a>
			<a href={resolve('/sitemap')} class="hover:text-foreground transition-colors">sitemap</a>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- mailto link -->
			<a
				href="mailto:{site.email}"
				class="hover:text-foreground transition-colors"
				aria-label="Email {site.email}"
			>
				<Mail class="size-4" aria-hidden="true" />
			</a>
		</div>
		<p>Copyright {year} {site.author}</p>
	</footer>
</div>
