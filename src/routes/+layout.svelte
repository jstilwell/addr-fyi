<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Mail from '@lucide/svelte/icons/mail';
	import Terminal from '@lucide/svelte/icons/terminal';
	import favicon from '$lib/assets/favicon.svg';
	import { site } from '$lib/config/site';

	let { children } = $props();

	const onHome = $derived(page.url.pathname === '/');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#211f1a" />
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
		<a
			href="https://github.com/jstilwell/addr-fyi"
			class="text-muted-foreground hover:text-foreground text-sm transition-colors"
		>
			[src]
		</a>
	</header>

	{@render children?.()}

	<footer class="text-muted-foreground mt-auto flex flex-col gap-3 text-xs">
		{#if onHome}
			<p>
				every panel above is a rendered <code>curl</code> — the same bytes, drawn nicer. pipe away:
				<code class="text-foreground">curl addr.fyi</code>
			</p>
		{/if}
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
