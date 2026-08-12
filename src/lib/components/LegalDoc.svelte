<script lang="ts">
	import type { LegalDoc } from '$lib/content/legal';

	let { doc }: { doc: LegalDoc } = $props();
</script>

<article class="flex flex-col gap-8">
	<header>
		<h1 class="text-2xl font-bold">{doc.title}</h1>
		<p class="text-muted-foreground mt-1 text-xs">updated: {doc.updated}</p>
	</header>
	{#each doc.sections as section (section.heading)}
		<section>
			<h2 class="mb-2 font-bold">
				<span class="text-primary">#</span>
				{section.heading}
			</h2>
			{#each section.body as paragraph, i (i)}
				<p class="text-muted-foreground mt-2 text-sm leading-relaxed">{paragraph}</p>
			{/each}
		</section>
	{/each}
</article>
