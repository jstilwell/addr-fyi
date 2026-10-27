<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { FORWARD_RECORD_TYPES } from '#lib/dns-record-types.js';
	import { curlCommand } from '#lib/curl.js';
	import CopyButton from '#lib/components/CopyButton.svelte';
	import Panel from '#lib/components/Panel.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { site } from '#lib/config/site.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Network from '@lucide/svelte/icons/network';

	let { data } = $props();

	const host = page.url.host || 'addr.fyi';

	// Escape user input for a path segment, but keep IPv6 colons readable in the
	// curl commands we display (they're legal in a path).
	const encodeSegment = (value: string) => encodeURIComponent(value).replace(/%3A/gi, ':');

	type Tool = {
		id: string;
		label: string;
		/** Keyboard shortcut: a letter of the label, pressed to open the tab. */
		hotkey: string;
		placeholder: string;
		/** One line under the input saying what the tool does. */
		hint?: string;
		path: (query: string) => string;
		/** false = the tool takes no query (e.g. weather); default true. */
		requiresInput?: boolean;
	};

	// Slashes inside the query stay raw (CIDR prefixes); each piece is escaped.
	const encodePath = (q: string) => q.split('/').map(encodeSegment).join('/');

	const tools: Tool[] = [
		{
			id: 'lookup',
			label: 'lookup',
			hotkey: 'l',
			placeholder: '8.8.8.8',
			path: (q) => `/find/${encodeSegment(q)}`
		},
		{
			id: 'dns',
			label: 'dns',
			hotkey: 'd',
			placeholder: 'example.com or 1.1.1.1',
			// IPs get a reverse (PTR) lookup server-side; the type only applies to names.
			path: (q) => {
				const params = new URLSearchParams({
					...(!dnsInputIsIp && dnsType !== 'A' && { type: dnsType }),
					...(dnsCompare && { resolvers: 'all' })
				}).toString();
				return `/dns/${encodeSegment(q)}${params ? `?${params}` : ''}`;
			}
		},
		{
			id: 'whois',
			label: 'whois',
			hotkey: 'w',
			placeholder: 'example.com, 8.8.8.8, or AS13335',
			path: (q) => `/whois/${encodeSegment(q)}`
		},
		{
			id: 'bgp',
			label: 'bgp',
			hotkey: 'b',
			placeholder: '1.1.1.1, 1.1.1.0/24, or AS13335',
			hint: 'an IP or prefix gets its origin network and RPKI status; an ASN gets its prefixes and upstreams',
			path: (q) => `/bgp/${encodePath(q)}`
		},
		{
			id: 'cidr',
			label: 'cidr',
			hotkey: 'c',
			placeholder: '10.0.0.0/24',
			path: (q) => `/cidr/${encodePath(q)}`
		},
		{
			id: 'convert',
			label: 'convert',
			hotkey: 'v',
			placeholder: '8.8.8.8, 2001:db8::1, or 134744072',
			hint: 'every representation of an address (decimal, hex, binary, IPv6 forms) and its scope',
			path: (q) => `/convert/${encodeSegment(q)}`
		},
		{
			id: 'mail',
			label: 'mail',
			hotkey: 'i',
			placeholder: 'example.com',
			hint: "a domain's MX, SPF, DMARC, DKIM, MTA-STS, TLS-RPT and BIMI, with problems flagged",
			path: (q) => `/mail/${encodeSegment(q)}`
		},
		{
			id: 'certs',
			label: 'certs',
			hotkey: 's',
			placeholder: 'example.com',
			hint: 'unexpired certificates for a domain and its subdomains, from Certificate Transparency logs',
			path: (q) => `/certs/${encodeSegment(q)}`
		},
		{
			id: 'http',
			label: 'http',
			hotkey: 't',
			placeholder: 'example.com or https://example.com/path',
			hint: 'redirect chain, headers, timing and a security-header audit, fetched from the edge',
			// The URL goes in as-is (its own slashes and query string included);
			// a #fragment never leaves the browser, so it's dropped.
			path: (q) => `/http/${encodeURI(q.replace(/#.*$/, ''))}`
		},
		{
			id: 'port',
			label: 'port',
			hotkey: 'p',
			placeholder: '22',
			path: (q) => `/port/${encodeSegment(q)}`
		},
		{
			id: 'mac',
			label: 'mac',
			hotkey: 'm',
			placeholder: '00:1a:2b:3c:4d:5e',
			hint: 'vendor from the IEEE registry, plus multicast and randomized-address flags',
			path: (q) => `/mac/${encodeSegment(q)}`
		},
		{
			id: 'weather',
			label: 'weather',
			hotkey: 'e',
			placeholder: '',
			requiresInput: false,
			path: () => '/weather'
		}
	];

	let activeTab = $state('lookup');
	let dnsType = $state('A');
	// dns tab: ask several public resolvers and compare (?resolvers=all).
	let dnsCompare = $state(false);
	let copied = $state(false);
	// Screen-reader announcement for copy feedback (the icons alone are silent).
	let announcement = $state('');

	// Per-tool state: what was asked, what came back.
	let inputs = $state<Record<string, string>>(Object.fromEntries(tools.map((t) => [t.id, ''])));
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

	// Label the hero eyebrow with the actual address family. Colons mean IPv6;
	// a valid dotted quad means IPv4; anything else stays generic.
	const ipVersionLabel = $derived(
		data.client.ip.includes(':')
			? 'your IPv6 address'
			: clientIpv4
				? 'your IPv4 address'
				: 'your address'
	);

	// The tab bar: every tool, then the two read-only tabs.
	const menu: { id: string; label: string; hotkey: string }[] = [
		...tools,
		{ id: 'headers', label: 'headers', hotkey: 'h' },
		{ id: 'api', label: 'api', hotkey: 'a' }
	];
	const TABS = menu.map((item) => item.id);

	// Seeded with null: bind:ref on the Input refuses an undefined start value.
	let inputRefs = $state<Record<string, HTMLInputElement | null>>(
		Object.fromEntries(tools.map((t) => [t.id, null]))
	);

	function onTabChange(value: string) {
		// Weather needs no input — fetch it the first time the tab opens.
		if (value === 'weather' && !outputs.weather && !running.weather) {
			void run(tools.find((t) => t.id === 'weather')!);
		} else {
			syncUrl(value);
		}
	}

	// Single-key navigation: press a tab's hotkey (its underlined letter) to open it
	// (and land in its query field). Ignored while typing, so it never steals
	// keystrokes; Escape leaves a field to get the hotkeys back.
	async function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target.closest('input, select, textarea, [contenteditable]')) {
			if (event.key === 'Escape') target.blur();
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
		const item = menu.find((m) => m.hotkey === event.key.toLowerCase());
		if (!item) return;
		event.preventDefault();
		if (activeTab !== item.id) {
			activeTab = item.id;
			onTabChange(item.id);
		}
		await tick();
		inputRefs[item.id]?.focus();
	}

	// What each tool last ran, so the address bar can reflect the open tab.
	const lastRun: Record<string, Record<string, string>> = {};

	// Mirror the open tab (and its last query) into the URL, so any result can
	// be shared or bookmarked. replace: no new history entry per run.
	function syncUrl(tab: string) {
		const search = new URLSearchParams({
			...(tab !== 'lookup' && { tab }),
			...lastRun[tab]
		}).toString();
		goto(resolve(search ? `/?${search}` : '/'), { shallow: true, replace: true });
	}

	/**
	 * updateUrl: false for the deep-linked run on load — the address bar already
	 * says what's running, and a shallow goto can't run before the router
	 * has finished hydrating.
	 */
	async function run(tool: Tool, { updateUrl = true } = {}) {
		const query = inputs[tool.id].trim();
		if ((query === '' && (tool.requiresInput ?? true)) || running[tool.id]) return;

		lastRun[tool.id] = {
			...(query && { q: query }),
			...(tool.id === 'dns' && !dnsInputIsIp && dnsType !== 'A' && { type: dnsType }),
			...(tool.id === 'dns' && dnsCompare && { resolvers: 'all' })
		};
		if (updateUrl) syncUrl(tool.id);

		const path = tool.path(query);
		commands[tool.id] = curlCommand(`${host}${path}`);
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

	/** Copy text; false when the browser refuses (insecure context, denied permission). */
	async function copyText(text: string): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(text);
			announcement = 'Copied to clipboard';
			return true;
		} catch {
			announcement = "Couldn't copy — select the text and copy it manually";
			return false;
		}
	}

	async function copyIp() {
		if (!(await copyText(data.client.ip))) return;
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	// Pre-fill the IP-shaped tools with the visitor's own address so there's a
	// real, relevant example already in the field. Then honor deep links:
	// /?tab=dns&q=example.com&type=MX (browsers visiting /dns/example.com etc.
	// are redirected here), and the older /?q=8.8.8.8 form for lookup.
	onMount(() => {
		if (clientIpv4) {
			inputs.lookup = clientIpv4;
			inputs.dns = clientIpv4;
			inputs.bgp = clientIpv4;
			inputs.cidr = clientCidr24 ?? '';
		}
		// Any address family converts, so this one takes IPv6 visitors too.
		inputs.convert = data.client.ip;

		const params = page.url.searchParams;
		const q = params.get('q');
		const tab = params.get('tab') ?? (q ? 'lookup' : null);
		if (!tab || !TABS.includes(tab)) return;

		activeTab = tab;
		const tool = tools.find((t) => t.id === tab);
		if (!tool) return;

		const type = params.get('type')?.toUpperCase();
		if (tool.id === 'dns' && type && (FORWARD_RECORD_TYPES as readonly string[]).includes(type)) {
			dnsType = type;
		}
		if (tool.id === 'dns') dnsCompare = params.get('resolvers') === 'all';
		if (q) inputs[tool.id] = q;
		if (q || tool.requiresInput === false) void run(tool, { updateUrl: false });
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

	// The dns tool handles both directions — a name gets forward records, an IP
	// gets a reverse (PTR) lookup — so show one of each as runnable examples.
	const dnsExamples = [
		{ query: 'example.com', kind: 'a domain name (forward)' },
		{ query: '8.8.8.8', kind: 'an IP address (reverse/PTR)' }
	];

	function runDnsExample(query: string) {
		inputs.dns = query;
		void run(tools.find((t) => t.id === 'dns')!);
	}

	// Clicking the visitor's own AS badge jumps to the whois tab and looks it up.
	function lookupAsn(asn: number) {
		activeTab = 'whois';
		runWhoisExample(`AS${asn}`);
	}

	// path: what's shown (with placeholders). example: a concrete, runnable path
	// used for the copy button so the copied curl actually works as-is. The
	// IP-shaped examples use the visitor's own address (matching the tab
	// pre-fill), falling back to generic values for IPv6 visitors. /dns and
	// /whois keep a domain/ASN example on purpose, to show the non-IP capability.
	const endpoints = $derived<{ path: string; example: string; desc: string }[]>([
		{ path: '/', example: '/', desc: 'your IP address' },
		{ path: '/geo', example: '/geo', desc: 'your IP + geolocation (from the edge, no lookup)' },
		{ path: '/json', example: '/json', desc: 'everything we know about you, as JSON' },
		{
			path: '/find/{ip}',
			example: `/find/${clientIpv4 ?? '8.8.8.8'}`,
			desc: 'geolocate any IP or hostname'
		},
		{
			path: '/dns/{name|ip}?type=MX',
			example: '/dns/example.com?type=MX',
			desc: 'DNS records over DoH; IPs get a reverse (PTR) lookup'
		},
		{
			path: '/dns/{name}?resolvers=all',
			example: '/dns/example.com?resolvers=all',
			desc: 'compare answers across Cloudflare, Google, AdGuard and NextDNS'
		},
		{
			path: '/whois/{ip|domain|asn}',
			example: '/whois/AS13335',
			desc: 'registration data via RDAP'
		},
		{
			path: '/bgp/{ip|prefix|asn}',
			example: '/bgp/AS13335',
			desc: 'origin AS + RPKI for an IP; prefixes + upstreams for an ASN'
		},
		{
			path: '/cidr/{range}',
			example: `/cidr/${clientCidr24 ?? '10.0.0.0/24'}`,
			desc: 'subnet calculator (IPv4 + IPv6)'
		},
		{
			path: '/convert/{ip}',
			example: `/convert/${clientIpv4 ?? '8.8.8.8'}`,
			desc: 'decimal, hex, binary and IPv6 forms of an address, plus its scope'
		},
		{
			path: '/mail/{domain}',
			example: '/mail/example.com',
			desc: 'MX, SPF, DMARC, DKIM, MTA-STS, TLS-RPT and BIMI, with issues'
		},
		{
			path: '/certs/{domain}',
			example: '/certs/example.com',
			desc: 'certificates for a domain + subdomains, from CT logs'
		},
		{
			path: '/http/{url}',
			example: '/http/example.com',
			desc: 'redirect chain, headers, timing and security-header audit'
		},
		{ path: '/port/{port}', example: '/port/22', desc: 'is this port open on your IP?' },
		{
			path: '/mac/{address}',
			example: '/mac/00:1a:2b:3c:4d:5e',
			desc: 'MAC vendor lookup (IEEE registry)'
		},
		{ path: '/weather', example: '/weather', desc: "weather + alerts at your IP's location" },
		{ path: '/headers', example: '/headers', desc: 'your request headers, echoed back' },
		{ path: '/ua', example: '/ua', desc: 'your user agent' },
		{ path: '/health', example: '/health', desc: 'liveness check' }
	]);

	// The command each tool shows before it has run, using its placeholder query.
	const placeholderCommand = (tool: Tool) => curlCommand(`${host}${tool.path(tool.placeholder)}`);
	const headersCommand = curlCommand(`${host}/headers`);
</script>

<Seo title="addr.fyi — your IP and quick network lookups" description={site.description} path="/" />

<svelte:window onkeydown={onKeydown} />

<p class="sr-only" aria-live="polite">{announcement}</p>

<!-- Hero: the same answer curl gets, rendered. -->
<section aria-label="Your IP address">
	<p class="text-muted-foreground mb-3 text-xs tracking-[0.25em] uppercase">
		<span class="text-ansi-magenta">//</span>
		{ipVersionLabel}
	</p>
	<button
		class="group flex flex-wrap items-center gap-x-4 gap-y-2 text-left"
		onclick={copyIp}
		title="Copy to clipboard"
	>
		<span class="text-glow text-4xl font-bold break-all sm:text-5xl">
			{data.client.ip}
		</span>
		<span class="text-muted-foreground group-hover:text-foreground transition-colors">
			{#if copied}
				<Check class="text-ansi-green size-5" aria-label="Copied" />
			{:else}
				<Copy class="size-5" aria-label="Copy IP" />
			{/if}
		</span>
	</button>
	<div class="mt-4 flex flex-wrap items-center gap-2">
		{#if geoLine}
			<Badge variant="outline" class="text-muted-foreground bg-card/60 gap-1.5 font-normal">
				<MapPin class="text-ansi-magenta size-3.5" aria-hidden="true" />{geoLine}
			</Badge>
		{/if}
		{#if data.client.asn}
			<button type="button" onclick={() => lookupAsn(data.client.asn!)} title="Look up this ASN">
				<Badge
					variant="outline"
					class="text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-card/60 gap-1.5 font-normal transition-colors"
				>
					<Network class="text-ansi-blue size-3.5" aria-hidden="true" />AS{data.client.asn}
					{data.client.org}
				</Badge>
			</button>
		{/if}
		{#if data.client.colo}
			<Badge variant="outline" class="text-muted-foreground bg-card/60 font-normal">
				edge: {data.client.colo}
			</Badge>
		{/if}
	</div>
</section>

<!-- Tools -->
<Tabs.Root bind:value={activeTab} onValueChange={onTabChange} class="gap-4">
	<!-- Each tab's hotkey letter is underlined, menu-accelerator style. The bar
	     wraps rather than scrolls, so every tool stays visible. -->
	<Tabs.List class="h-auto w-full flex-wrap justify-start border-b">
		{#each menu as item (item.id)}
			{@const at = item.label.indexOf(item.hotkey)}
			<Tabs.Trigger value={item.id} aria-keyshortcuts={item.hotkey}>
				<span
					>{item.label.slice(0, at)}<span
						class="decoration-foreground/30 underline underline-offset-4">{item.hotkey}</span
					>{item.label.slice(at + 1)}</span
				>
			</Tabs.Trigger>
		{/each}
	</Tabs.List>

	{#each tools as tool (tool.id)}
		<Tabs.Content value={tool.id}>
			<Panel class="flex flex-col gap-4">
				<form
					class="flex flex-col gap-2 sm:flex-row"
					onsubmit={(e) => {
						e.preventDefault();
						void run(tool);
					}}
				>
					{#if tool.requiresInput ?? true}
						<Input
							bind:ref={inputRefs[tool.id]}
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
							{#each FORWARD_RECORD_TYPES as type (type)}
								<option value={type}>{type}</option>
							{/each}
						</select>
					{/if}
					<Button type="submit" disabled={running[tool.id]} class="font-bold">
						{running[tool.id] ? 'running…' : (tool.requiresInput ?? true) ? 'run' : 'refresh'}
					</Button>
				</form>

				{#if tool.hint}
					<p class="text-muted-foreground text-xs">{tool.hint}</p>
				{/if}
				{#if tool.id === 'port'}
					<p class="text-muted-foreground text-xs">
						connects back to your IP (<span class="text-foreground">{data.client.ip}</span>) on that
						port to see if it's reachable from the internet. It can't test anyone else.
					</p>
				{/if}
				{#if tool.id === 'dns'}
					<label class="text-muted-foreground flex w-fit items-center gap-2 text-xs">
						<input type="checkbox" bind:checked={dnsCompare} class="accent-primary" />
						compare answers across Cloudflare, Google, AdGuard and NextDNS
					</label>
				{/if}

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
							{@const command = curlCommand(`${host}/whois/${example.query}`)}
							<div class="flex flex-wrap items-center gap-x-2">
								<button
									type="button"
									class="text-muted-foreground hover:text-foreground text-left transition-colors"
									onclick={() => runWhoisExample(example.query)}
								>
									<span class="text-primary select-none">$&nbsp;</span>{command}
								</button>
								<CopyButton text={command} />
								<span class="text-muted-foreground/70"># {example.kind}</span>
							</div>
						{/each}
					</div>
				{/if}

				{#if tool.id === 'dns'}
					<div
						class="flex flex-col gap-1.5 text-sm transition-opacity {commands.dns
							? 'opacity-50 hover:opacity-100'
							: ''}"
					>
						<p class="text-muted-foreground text-xs">dns accepts a domain name or an IP address:</p>
						{#each dnsExamples as example (example.query)}
							{@const command = curlCommand(`${host}/dns/${example.query}`)}
							<div class="flex flex-wrap items-center gap-x-2">
								<button
									type="button"
									class="text-muted-foreground hover:text-foreground text-left transition-colors"
									onclick={() => runDnsExample(example.query)}
								>
									<span class="text-primary select-none">$&nbsp;</span>{command}
								</button>
								<CopyButton text={command} />
								<span class="text-muted-foreground/70"># {example.kind}</span>
							</div>
						{/each}
					</div>
				{/if}

				{#if commands[tool.id]}
					<div class="flex flex-col gap-1 text-sm">
						<p class="text-muted-foreground flex items-center gap-2">
							<span><span class="text-primary select-none">$&nbsp;</span>{commands[tool.id]}</span>
							<CopyButton text={commands[tool.id]} />
						</p>
						{#if running[tool.id]}
							<div
								class="bg-sunken flex flex-col gap-2.5 rounded-lg border p-3"
								aria-label="Waiting for results"
							>
								<Skeleton class="h-3.5 w-2/5" />
								<Skeleton class="h-3.5 w-3/5" />
								<Skeleton class="h-3.5 w-1/2" />
								<Skeleton class="h-3.5 w-1/3" />
							</div>
						{:else}
							<pre
								class="bg-sunken overflow-x-auto rounded-lg border p-3 leading-relaxed whitespace-pre-wrap {failed[
									tool.id
								]
									? 'text-destructive'
									: ''}">{outputs[tool.id] || ' '}</pre>
						{/if}
					</div>
				{:else if tool.id !== 'whois' && tool.id !== 'dns'}
					<p class="text-muted-foreground flex items-center gap-2 text-sm">
						<span
							><span class="text-primary select-none">$&nbsp;</span>{placeholderCommand(tool)}</span
						>
						<CopyButton text={placeholderCommand(tool)} />
					</p>
				{/if}
			</Panel>
		</Tabs.Content>
	{/each}

	<Tabs.Content value="headers">
		<Panel class="flex flex-col gap-2">
			<p class="text-muted-foreground flex items-center gap-2 text-sm">
				<span><span class="text-primary select-none">$&nbsp;</span>{headersCommand}</span>
				<CopyButton text={headersCommand} />
			</p>
			<pre
				class="bg-sunken overflow-x-auto rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-wrap">{headerLines}</pre>
		</Panel>
	</Tabs.Content>

	<Tabs.Content value="api">
		<Panel title="plaintext api" class="flex flex-col gap-4">
			<p class="text-muted-foreground text-sm">
				Every endpoint speaks plaintext to curl and JSON to
				<code class="text-foreground">Accept: application/json</code>.
			</p>
			<dl class="flex flex-col gap-2 text-sm">
				{#each endpoints as endpoint (endpoint.path)}
					<div class="flex items-start gap-2 sm:gap-4">
						<CopyButton text={curlCommand(`${host}${endpoint.example}`)} class="mt-0.5" />
						<div class="flex min-w-0 flex-1 flex-col sm:flex-row sm:gap-4">
							<dt class="text-primary shrink-0 break-all sm:w-52">{endpoint.path}</dt>
							<dd class="text-muted-foreground">{endpoint.desc}</dd>
						</div>
					</div>
				{/each}
			</dl>
		</Panel>
	</Tabs.Content>
</Tabs.Root>
