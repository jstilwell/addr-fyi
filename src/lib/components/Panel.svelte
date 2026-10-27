<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	// A terminal window: translucent card with a thin ember → magenta glow
	// along its top edge, and an optional `# title` heading.
	let {
		title,
		class: className,
		children
	}: { title?: string; class?: string; children: Snippet } = $props();
</script>

<section
	class={cn(
		'bg-card/70 relative rounded-xl border p-4 shadow-[0_8px_32px_rgb(0_0_0_/_0.35)] backdrop-blur-sm sm:p-5',
		'before:via-ansi-red before:absolute before:inset-x-6 before:-top-px before:h-px before:bg-linear-to-r before:from-transparent before:to-transparent before:opacity-70',
		className
	)}
>
	{#if title}
		<h2 class="text-sm font-semibold">
			<span class="text-primary">#</span>
			{title}
		</h2>
	{/if}
	{@render children()}
</section>
