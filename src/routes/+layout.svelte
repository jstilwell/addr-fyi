<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import Mail from '@lucide/svelte/icons/mail';
	import Terminal from '@lucide/svelte/icons/terminal';
	import { site } from '$lib/config/site';

	let { children } = $props();

	// Magnifying-glass emoji rendered as an inline SVG favicon — no asset file,
	// crisp at any size. dominant-baseline centers the glyph in the viewbox.
	const favicon =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="52" font-size="76" text-anchor="middle" dominant-baseline="central">🔍</text></svg>'
		);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#211f1a" />
</svelte:head>

<div class="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
	<header class="flex items-center">
		<a
			href={resolve('/')}
			class="flex items-center gap-2 text-lg font-bold tracking-tight"
			aria-label="addr.fyi home"
		>
			<Terminal class="text-primary size-5" aria-hidden="true" />
			<span>addr.fyi</span><span class="cursor-blink text-primary -ml-1">▊</span>
		</a>
	</header>

	{@render children?.()}

	<footer class="text-muted-foreground mt-auto flex flex-col gap-3 text-xs">
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
	</footer>
</div>
