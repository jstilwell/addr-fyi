<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Seo from '$lib/components/Seo.svelte';
	import { site } from '$lib/config/site';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tabs from '$lib/components/ui/tabs';
	import Calculator from '@lucide/svelte/icons/calculator';
	import Check from '@lucide/svelte/icons/check';
	import CloudSun from '@lucide/svelte/icons/cloud-sun';
	import Copy from '@lucide/svelte/icons/copy';
	import FileSearch from '@lucide/svelte/icons/file-search';
	import FileText from '@lucide/svelte/icons/file-text';
	import Globe from '@lucide/svelte/icons/globe';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Network from '@lucide/svelte/icons/network';
	import Search from '@lucide/svelte/icons/search';
	import Terminal from '@lucide/svelte/icons/terminal';

	let { data } = $props();

	const host = page.url.host || 'addr.fyi';
	const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'SRV', 'CAA'];

	type Tool = {
		id: string;
		label: string;
		icon: typeof Search;
		placeholder: string;
		path: (query: string) => string;
		/** false = the tool takes no query (e.g. weather); default true. */
		requiresInput?: boolean;
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
			placeholder: 'example.com or 1.1.1.1',
			// IPs get a reverse (PTR) lookup server-side; the type only applies to names.
			path: (q) =>
				`/dns/${encodeURIComponent(q)}${dnsInputIsIp || dnsType === 'A' ? '' : `?type=${dnsType}`}`
		},
		{
			id: 'weather',
			label: 'weather',
			icon: CloudSun,
			placeholder: '',
			requiresInput: false,
			path: () => '/weather'
		},
		{
			id: 'whois',
			label: 'whois',
			icon: FileSearch,
			placeholder: 'example.com, 8.8.8.8, or AS13335',
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
		weather: '',
		whois: '',
		cidr: ''
	});
	let outputs = $state<Record<string, string>>({});
	let commands = $state<Record<string, string>>({});
	let running = $state<Record<string, boolean>>({});
	let failed = $state<Record<string, boolean>>({});

	// Rough client-side check so the dns panel can hide the record-type select
	// for IPs; the endpoint does its own strict detection.
	const dnsInputIsIp = $derived(
		/^\d{1,3}(\.\d{1,3}){3}$/.test(inputs.dns.trim()) || inputs.dns.includes(':')
	);

	// The visitor's own IPv4, if they have one, used to pre-fill example queries.
	// IPv6 visitors (and dev's ::1) fall back to the static placeholders.
	const clientIpv4 = $derived(
		/^\d{1,3}(\.\d{1,3}){3}$/.test(data.client.ip) ? data.client.ip : null
	);
	// The /24 that contains the visitor's IPv4, e.g. 128.143.20.111 -> 128.143.20.0/24.
	const clientCidr24 = $derived(clientIpv4 ? clientIpv4.replace(/\.\d+$/, '.0') + '/24' : null);

	async function run(tool: Tool) {
		const query = inputs[tool.id].trim();
		if ((query === '' && (tool.requiresInput ?? true)) || running[tool.id]) return;

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
	// Otherwise pre-fill the IP-shaped tools with the visitor's own address so
	// there's a real, relevant example already in the field.
	onMount(() => {
		const q = page.url.searchParams.get('q');
		if (q) {
			inputs.lookup = q;
			void run(tools[0]);
		} else if (clientIpv4) {
			inputs.lookup = clientIpv4;
			inputs.dns = clientIpv4;
			inputs.cidr = clientCidr24 ?? '';
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

	// The three things whois (RDAP) can resolve — shown as runnable examples in
	// the whois tab so people see the full range without guessing.
	const whoisExamples = [
		{ query: 'example.com', kind: 'a domain' },
		{ query: '8.8.8.8', kind: 'an IP address' },
		{ query: 'AS13335', kind: 'an ASN' }
	];

	function runWhoisExample(query: string) {
		inputs.whois = query;
		void run(tools.find((t) => t.id === 'whois')!);
	}

	// Clicking the visitor's own AS badge jumps to the whois tab and looks it up.
	function lookupAsn(asn: number) {
		activeTab = 'whois';
		runWhoisExample(`AS${asn}`);
	}

	const endpoints = [
		['/', 'your IP address'],
		['/geo', 'your IP + geolocation (from the edge, no lookup)'],
		['/json', 'everything we know about you, as JSON'],
		['/find/{ip}', 'geolocate any IP or hostname'],
		['/dns/{name|ip}?type=MX', 'DNS records over DoH; IPs get a PTR lookup'],
		['/rdns/{ip}', 'reverse DNS (PTR)'],
		['/weather', "weather + alerts at your IP's location"],
		['/whois/{ip|domain|asn}', 'registration data via RDAP'],
		['/cidr/{range}', 'subnet calculator (IPv4 + IPv6)'],
		['/headers', 'your request headers, echoed back'],
		['/ua', 'your user agent'],
		['/health', 'liveness check']
	];
</script>

<Seo title="addr.fyi — your IP and quick network lookups" description={site.description} path="/" />

<!-- Hero: the same answer curl gets, rendered. -->
<section aria-label="Your IP address">
	<p class="text-muted-foreground mb-3 text-xs tracking-[0.25em] uppercase">your address</p>
	<button
		class="group flex flex-wrap items-center gap-x-4 gap-y-2 text-left"
		onclick={copyIp}
		title="Copy to clipboard"
	>
		<span class="text-primary text-4xl font-bold break-all sm:text-5xl">
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
			<button type="button" onclick={() => lookupAsn(data.client.asn!)} title="Look up this ASN">
				<Badge
					variant="outline"
					class="text-muted-foreground hover:text-foreground hover:border-foreground/30 gap-1.5 font-normal transition-colors"
				>
					<Network class="size-3.5" aria-hidden="true" />AS{data.client.asn}
					{data.client.org}
				</Badge>
			</button>
		{/if}
		{#if data.client.colo}
			<Badge variant="outline" class="text-muted-foreground font-normal">
				edge: {data.client.colo}
			</Badge>
		{/if}
	</div>
</section>

<!-- Tools -->
<Tabs.Root
	bind:value={activeTab}
	onValueChange={(value) => {
		// Weather needs no input — fetch it the first time the tab opens.
		if (value === 'weather' && !outputs.weather && !running.weather) {
			void run(tools.find((t) => t.id === 'weather')!);
		}
	}}
>
	<Tabs.List class="no-scrollbar w-full justify-start overflow-x-auto overflow-y-hidden">
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
						{#if tool.requiresInput ?? true}
							<Input
								bind:value={inputs[tool.id]}
								placeholder={tool.placeholder}
								autocomplete="off"
								autocapitalize="off"
								spellcheck={false}
								aria-label={`${tool.label} query`}
							/>
						{/if}
						{#if tool.id === 'dns' && !dnsInputIsIp}
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
							{running[tool.id] ? 'running…' : (tool.requiresInput ?? true) ? 'run' : 'refresh'}
						</Button>
					</form>

					{#if tool.id === 'whois'}
						<!-- Once a real lookup has run, dim the examples so the actual command
						     above stands out; hover restores full contrast for clicking. -->
						<div
							class="flex flex-col gap-1.5 text-sm transition-opacity {commands.whois
								? 'opacity-50 hover:opacity-100'
								: ''}"
						>
							<p class="text-muted-foreground text-xs">
								whois accepts a domain, an IP address, or an ASN:
							</p>
							{#each whoisExamples as example (example.query)}
								<button
									type="button"
									class="text-muted-foreground hover:text-foreground text-left transition-colors"
									onclick={() => runWhoisExample(example.query)}
								>
									<span class="text-primary select-none">$&nbsp;</span>curl {host}/whois/{example.query}
									<span class="text-muted-foreground/70"># {example.kind}</span>
								</button>
							{/each}
						</div>
					{/if}

					{#if commands[tool.id]}
						<div class="flex flex-col gap-1 text-sm">
							<p class="text-muted-foreground">
								<span class="text-primary select-none">$&nbsp;</span>{commands[tool.id]}
							</p>
							{#if running[tool.id]}
								<div
									class="bg-background flex flex-col gap-2.5 rounded-md p-3"
									aria-label="Waiting for results"
								>
									<Skeleton class="h-3.5 w-2/5" />
									<Skeleton class="h-3.5 w-3/5" />
									<Skeleton class="h-3.5 w-1/2" />
									<Skeleton class="h-3.5 w-1/3" />
								</div>
							{:else}
								<pre
									class="bg-background overflow-x-auto rounded-md p-3 leading-relaxed whitespace-pre-wrap {failed[
										tool.id
									]
										? 'text-destructive'
										: ''}">{outputs[tool.id] || ' '}</pre>
							{/if}
						</div>
					{:else if tool.id !== 'whois'}
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
