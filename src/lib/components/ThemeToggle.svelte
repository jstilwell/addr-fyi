<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	// The pre-paint script in app.html sets the initial .dark class; this mirrors
	// it into reactive state on mount, then keeps <html> and localStorage in sync.
	let dark = $state(false);

	onMount(() => {
		dark = document.documentElement.classList.contains('dark');
	});

	function toggle() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem('theme', dark ? 'dark' : 'light');
	}
</script>

<Button
	variant="ghost"
	size="icon"
	onclick={toggle}
	aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
	title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
	class="text-muted-foreground hover:text-foreground"
>
	{#if dark}
		<Sun class="size-4" aria-hidden="true" />
	{:else}
		<Moon class="size-4" aria-hidden="true" />
	{/if}
</Button>
