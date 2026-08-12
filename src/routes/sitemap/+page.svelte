<script lang="ts">
	import { resolve } from '$app/paths';
	import Seo from '$lib/components/Seo.svelte';
	import { PAGES } from '$lib/config/site';
</script>

<Seo
	title="sitemap — addr.fyi"
	description="Every page on addr.fyi in one place."
	path="/sitemap"
/>

<section>
	<h1 class="mb-6 text-2xl font-bold">
		<span class="text-primary">#</span> sitemap
	</h1>
	<dl class="flex flex-col gap-3 text-sm">
		{#each PAGES as page (page.path)}
			<div class="flex flex-col sm:flex-row sm:gap-4">
				<dt class="shrink-0 sm:w-32">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- paths come from the PAGES config -->
					<a href={resolve(page.path as '/')} class="text-primary hover:underline">{page.path}</a>
				</dt>
				<dd class="text-muted-foreground">{page.blurb}</dd>
			</div>
		{/each}
		<div class="flex flex-col sm:flex-row sm:gap-4">
			<dt class="shrink-0 sm:w-32">
				<a href={resolve('/sitemap.xml')} class="text-primary hover:underline">/sitemap.xml</a>
			</dt>
			<dd class="text-muted-foreground">this list as XML, for machines</dd>
		</div>
	</dl>
	<p class="text-muted-foreground mt-8 text-sm">
		The plaintext API endpoints live under the <a
			href={resolve('/')}
			class="text-primary hover:underline">api tab on the home page</a
		>, or <code>curl addr.fyi/sitemap</code> for this list.
	</p>
</section>
