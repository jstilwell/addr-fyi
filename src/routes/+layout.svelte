<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import Coffee from '@lucide/svelte/icons/coffee';
	import Mail from '@lucide/svelte/icons/mail';
	import PacketNetwork from '#lib/components/PacketNetwork.svelte';
	import { site } from '#lib/config/site.js';

	let { children } = $props();

	const year = new Date().getFullYear();

	// Terminal-prompt favicon (">_"): an ember chevron and magenta cursor on a
	// rounded night-indigo tile. Self-contained inline SVG, crisp at any size,
	// no asset file.
	const favicon =
		'data:image/svg+xml,' +
		encodeURIComponent(
			[
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
				'<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ff6a3d"/>',
				'<stop offset="1" stop-color="#e4548c"/></linearGradient></defs>',
				'<rect width="100" height="100" rx="22" fill="#161329"/>',
				'<path d="M28 34 L48 50 L28 66" fill="none" stroke="url(#g)" stroke-width="9"',
				' stroke-linecap="round" stroke-linejoin="round"/>',
				'<rect x="54" y="60" width="24" height="8" rx="4" fill="#e4548c"/>',
				'</svg>'
			].join('')
		);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<meta name="theme-color" content="#0c0a1a" />
</svelte:head>

<!-- Packet network behind the whole page, fixed while content scrolls over it. -->
<PacketNetwork class="fixed inset-0 -z-10 size-full opacity-40" />

<div class="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
	<header class="flex items-center justify-between gap-4">
		<a href={resolve('/')} class="text-lg font-bold tracking-tight" aria-label="addr.fyi home">
			<span class="text-ansi-magenta" aria-hidden="true">~/</span><span class="text-glow"
				>addr.fyi</span
			><span class="cursor-blink text-primary ml-0.5" aria-hidden="true">▊</span>
		</a>
		<span class="text-muted-foreground hidden text-sm sm:inline">
			<span class="text-primary select-none">$</span> curl addr.fyi
		</span>
	</header>

	{@render children?.()}

	<footer
		class="text-muted-foreground mt-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t pt-6 text-center text-xs"
	>
		<p>
			Copyright {year}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- external author link -->
			<a
				href={site.authorUrl}
				target="_blank"
				rel="noopener"
				class="hover:text-foreground underline-offset-2 transition-colors hover:underline"
			>
				{site.author}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</p>
		<span class="select-none">&bull;</span>
		<div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
			<a href={resolve('privacy')} class="hover:text-foreground transition-colors">privacy</a>
			<a href={resolve('terms')} class="hover:text-foreground transition-colors">terms</a>
			<a href={resolve('sitemap')} class="hover:text-foreground transition-colors">sitemap</a>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- external donate link -->
			<a
				href={site.donateUrl}
				target="_blank"
				rel="noopener"
				class="hover:text-foreground transition-colors"
				aria-label="Buy me a coffee"
			>
				<Coffee class="size-4" aria-hidden="true" />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
