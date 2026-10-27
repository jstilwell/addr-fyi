<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<!-- Muted label; the active tab lights up with an ember → magenta underline. -->
<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"text-muted-foreground hover:text-foreground focus-visible:outline-ring relative inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		'after:from-ansi-red after:to-ansi-magenta after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-linear-to-r after:opacity-0 after:transition-opacity',
		'data-active:text-foreground data-active:after:opacity-100',
		className
	)}
	{...restProps}
/>
