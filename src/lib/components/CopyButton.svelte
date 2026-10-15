<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import { cn } from '#lib/utils.js';

	let { text, class: className }: { text: string; class?: string } = $props();

	let copied = $state(false);
	// Screen-reader announcement for copy feedback (the icons alone are silent).
	let announcement = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		clearTimeout(timer);
		try {
			await navigator.clipboard.writeText(text);
			announcement = 'Copied to clipboard';
			copied = true;
		} catch {
			// Insecure context or denied permission.
			announcement = "Couldn't copy — select the text and copy it manually";
		}
		// Clear both so the next click flips the icon and announces again.
		timer = setTimeout(() => {
			copied = false;
			announcement = '';
		}, 1500);
	}
</script>

<button
	type="button"
	onclick={copy}
	aria-label={`Copy ${text}`}
	title="Copy command"
	class={cn('text-muted-foreground/60 hover:text-foreground shrink-0 transition-colors', className)}
>
	{#if copied}
		<Check class="text-primary size-3.5" aria-hidden="true" />
	{:else}
		<Copy class="size-3.5" aria-hidden="true" />
	{/if}
</button>
<span class="sr-only" aria-live="polite">{announcement}</span>
