<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import Calculator from '@lucide/svelte/icons/calculator';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import FileSearch from '@lucide/svelte/icons/file-search';
	import FileText from '@lucide/svelte/icons/file-text';
	import Globe from '@lucide/svelte/icons/globe';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Network from '@lucide/svelte/icons/network';
	import Search from '@lucide/svelte/icons/search';
	import Terminal from '@lucide/svelte/icons/terminal';
	import Undo2 from '@lucide/svelte/icons/undo-2';

	let { data } = $props();

	const host = page.url.host || 'addr.fyi';
	const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'SRV', 'CAA'];

	type Tool = {
		id: string;
		label: string;
		icon: typeof Search;
		placeholder: string;
		path: (query: string) => string;
	};

	const tools: Tool[] = [
		{
			id: 'lookup',
			label: 'lookup',
			icon: Search,
			placeholder: '8.8.8.8',
			path: (q) => `/find/${encodeURIComponent(q)}`
		},
		{
			id: 'dns',
			label: 'dns',
			icon: Globe,
			placeholder: 'example.com',
			path: (q) => `/dns/${encodeURIComponent(q)}${dnsType === 'A' ? '' : `?type=${dnsType}`}`
		},
		{
			id: 'rdns',
			label: 'rdns',
			icon: Undo2,
			placeholder: '1.1.1.1',
			path: (q) => `/rdns/${encodeURIComponent(q)}`
		},
		{
			id: 'whois',
			label: 'whois',
			icon: FileSearch,
			placeholder: 'example.com',
			path: (q) => `/whois/${encodeURIComponent(q)}`
		},
		{
			id: 'cidr',
			label: 'cidr',
			icon: Calculator,
			placeholder: '10.0.0.0/24',
			// The range's own slash must stay raw in the path.
			path: (q) => `/cidr/${q}`
		}
	];

	let activeTab = $state('lookup');
	let dnsType = $state('A');
	let copied = $state(false);

	// Per-tool state: what was asked, what came back.
	let inputs = $state<Record<string, string>>({
		lookup: '',
		dns: '',
		rdns: '',
		whois: '',
		cidr: ''
	});
	let outputs = $state<Record<string, string>>({});
	let commands = $state<Record<string, string>>({});
	let running = $state<Record<string, boolean>>({});
	let failed = $state<Record<string, boolean>>({});

	async function run(tool: Tool) {
		const query = inputs[tool.id].trim();
		if (!query || running[tool.id]) return;

		const path = tool.path(query);
		commands[tool.id] = `curl ${host}${path}`;
		running[tool.id] = true;
		failed[tool.id] = false;
		outputs[tool.id] = '';

		try {
			// No Accept header: the panel renders exactly what curl would print.
			const response = await fetch(path);
			outputs[tool.id] = (await response.text()).trimEnd();
			failed[tool.id] = !response.ok;
		} catch {
			outputs[tool.id] = 'Error: request failed';
			failed[tool.id] = true;
		} finally {
			running[tool.id] = false;
		}
	}

	async function copyIp() {
		await navigator.clipboard.writeText(data.client.ip);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	// addr.fyi/find/1.2.3.4 in a browser redirects here with ?q= — run it immediately.
	onMount(() => {
		const q = page.url.searchParams.get('q');
		if (q) {
			inputs.lookup = q;
			void run(tools[0]);
		}
	});

	const geoLine = $derived(
		[data.client.city, data.client.region, data.client.country].filter(Boolean).join(', ')
	);

	const headerLines = $derived(
		Object.entries(data.headers)
			.map(([name, value]) => `${name}: ${value}`)
			.join('\n')
	);

	const endpoints = [
		['/', 'your IP address'],
		['/geo', 'your IP + geolocation (from the edge, no lookup)'],
		['/json', 'everything we know about you, as JSON'],
		['/find/{ip}', 'geolocate any IP or hostname'],
		['/dns/{name}?type=MX', 'DNS records over DoH'],
		['/rdns/{ip}', 'reverse DNS (PTR)'],
		['/whois/{ip|domain|asn}', 'registration data via RDAP'],
		['/cidr/{range}', 'subnet calculator (IPv4 + IPv6)'],
		['/headers', 'your request headers, echoed back'],
		['/ua', 'your user agent'],
		['/health', 'liveness check']
	];
</script>

<svelte:head>
	<title>addr.fyi</title>
	<meta name="description" content="Your IP address and quick network lookups. curl-friendly." />
</svelte:head>

<div class="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
	<header class="flex items-center justify-between">
		<div class="flex items-center gap-2 text-lg font-bold tracking-tight">
			<Terminal class="text-primary size-5" aria-hidden="true" />
			<span>addr.fyi</span><span class="cursor-blink text-primary -ml-1">▊</span>
		</div>
		<a
			href="https://github.com/jstilwell/addr-fyi"
			class="text-muted-foreground hover:text-foreground text-sm transition-colors"
		>
			[src]
		</a>
	</header>

	<!-- Hero: the same answer curl gets, rendered. -->
	<section aria-label="Your IP address">
		<p class="text-muted-foreground mb-3 text-xs tracking-[0.25em] uppercase">your address</p>
		<button
			class="group flex flex-wrap items-center gap-x-4 gap-y-2 text-left"
			onclick={copyIp}
			title="Copy to clipboard"
		>
			<span class="phosphor text-primary text-4xl font-bold break-all sm:text-5xl">
				{data.client.ip}
			</span>
			<span class="text-muted-foreground group-hover:text-foreground transition-colors">
				{#if copied}
					<Check class="text-primary size-5" aria-label="Copied" />
				{:else}
					<Copy class="size-5" aria-label="Copy IP" />
				{/if}
			</span>
		</button>
		<div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
			{#if geoLine}
				<Badge variant="outline" class="text-muted-foreground gap-1.5 font-normal">
					<MapPin class="size-3.5" aria-hidden="true" />{geoLine}
				</Badge>
			{/if}
			{#if data.client.asn}
				<Badge variant="outline" class="text-muted-foreground gap-1.5 font-normal">
					<Network class="size-3.5" aria-hidden="true" />AS{data.client.asn}
					{data.client.org}
				</Badge>
			{/if}
			{#if data.client.colo}
				<Badge variant="outline" class="text-muted-foreground font-normal">
					edge: {data.client.colo}
				</Badge>
			{/if}
		</div>
	</section>

	<!-- Tools -->
	<Tabs.Root bind:value={activeTab}>
		<Tabs.List class="w-full justify-start overflow-x-auto">
			{#each tools as tool (tool.id)}
				<Tabs.Trigger value={tool.id} class="gap-1.5">
					<tool.icon class="size-3.5" aria-hidden="true" />{tool.label}
				</Tabs.Trigger>
			{/each}
			<Tabs.Trigger value="headers" class="gap-1.5">
				<FileText class="size-3.5" aria-hidden="true" />headers
			</Tabs.Trigger>
			<Tabs.Trigger value="api" class="gap-1.5">
				<Terminal class="size-3.5" aria-hidden="true" />api
			</Tabs.Trigger>
		</Tabs.List>

		{#each tools as tool (tool.id)}
			<Tabs.Content value={tool.id}>
				<Card.Root>
					<Card.Content class="flex flex-col gap-4">
						<form
							class="flex flex-col gap-2 sm:flex-row"
							onsubmit={(e) => {
								e.preventDefault();
								void run(tool);
							}}
						>
							<Input
								bind:value={inputs[tool.id]}
								placeholder={tool.placeholder}
								autocomplete="off"
								autocapitalize="off"
								spellcheck={false}
								aria-label={`${tool.label} query`}
							/>
							{#if tool.id === 'dns'}
								<select
									bind:value={dnsType}
									aria-label="Record type"
									class="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
								>
									{#each RECORD_TYPES as type (type)}
										<option value={type}>{type}</option>
									{/each}
								</select>
							{/if}
							<Button type="submit" disabled={running[tool.id]} class="font-bold">
								{running[tool.id] ? 'running…' : 'run'}
							</Button>
						</form>

						{#if commands[tool.id]}
							<div class="flex flex-col gap-1 text-sm">
								<p class="text-muted-foreground">
									<span class="text-primary select-none">$&nbsp;</span>{commands[tool.id]}
								</p>
								<pre
									class="bg-background overflow-x-auto rounded-md p-3 leading-relaxed whitespace-pre-wrap {failed[
										tool.id
									]
										? 'text-destructive'
										: ''}">{outputs[tool.id] || ' '}</pre>
							</div>
						{:else}
							<p class="text-muted-foreground text-sm">
								<span class="text-primary select-none">$&nbsp;</span>curl {host}{tool.path(
									tool.placeholder
								)}
							</p>
						{/if}
					</Card.Content>
				</Card.Root>
			</Tabs.Content>
		{/each}

		<Tabs.Content value="headers">
			<Card.Root>
				<Card.Content class="flex flex-col gap-2">
					<p class="text-muted-foreground text-sm">
						<span class="text-primary select-none">$&nbsp;</span>curl {host}/headers
					</p>
					<pre
						class="bg-background overflow-x-auto rounded-md p-3 text-sm leading-relaxed whitespace-pre-wrap">{headerLines}</pre>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="api">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">plaintext api</Card.Title>
					<Card.Description>
						Every endpoint speaks plaintext to curl and JSON to
						<code class="text-foreground">Accept: application/json</code>.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<dl class="flex flex-col gap-2 text-sm">
						{#each endpoints as [path, description] (path)}
							<div class="flex flex-col sm:flex-row sm:gap-4">
								<dt class="text-primary shrink-0 sm:w-56">{path}</dt>
								<dd class="text-muted-foreground">{description}</dd>
							</div>
						{/each}
					</dl>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>

	<footer class="text-muted-foreground mt-auto text-xs">
		<p>
			every panel above is a rendered <code>curl</code> — the same bytes, drawn nicer. pipe away:
			<code class="text-foreground">curl {host}</code>
		</p>
	</footer>
</div>
