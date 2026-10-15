<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { curlCommand } from '#lib/curl.js';
	import CopyButton from '#lib/components/CopyButton.svelte';

	// Browsers only: curl and JSON clients get a one-line error from hooks.server.ts.
	const notFound = $derived(page.status === 404);
	const command = $derived(curlCommand(`addr.fyi${page.url.pathname}`, '-I'));
</script>

<svelte:head>
	<title>{page.status} — addr.fyi</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="flex flex-col gap-4">
	<h1 class="text-2xl font-bold">
		<span class="text-primary">#</span>
		{page.status}
		{notFound ? 'not found' : 'error'}
	</h1>
	<p class="text-muted-foreground text-sm">
		{notFound
			? "There's nothing at this address. The tools all live on the home page."
			: (page.error?.message ?? 'Something went wrong.')}
	</p>
	<pre class="bg-card text-muted-foreground overflow-x-auto rounded-md p-3 text-sm"><span
			class="text-primary select-none">$&nbsp;</span
		>{command}<CopyButton text={command} class="ml-2 align-middle" />
HTTP/1.1 {page.status}</pre>
	<p class="text-sm">
		<a href={resolve('/')} class="text-primary hover:underline">← back to addr.fyi</a>
	</p>
</section>
