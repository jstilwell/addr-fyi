/**
 * MAC address vendor lookup against the IEEE OUI registry (MA-L, MA-M and
 * MA-S blocks), shipped as static/data/oui.tsv and refreshed with
 * `npm run update-oui`. The table is fetched and parsed once per isolate,
 * on first use, so it costs nothing at Worker startup.
 */

export type MacInfo = {
	mac: string;
	vendor: string | null;
	/** e.g. "MA-L 00:1A:2B" — the registry block that matched. */
	block: string | null;
	/** Reserved addresses (broadcast, multicast mappings) — not vendor-owned. */
	special: string | null;
	multicast: boolean;
	locallyAdministered: boolean;
};

export type MacResult = { ok: true; info: MacInfo } | { ok: false; error: string; status: number };

type Registry = Map<string, string>;

/** Registry prefix lengths in hex digits, longest (most specific) first. */
const BLOCKS: Array<[number, string]> = [
	[9, 'MA-S'],
	[7, 'MA-M'],
	[6, 'MA-L']
];

/** Reserved ranges, matched on the hex prefix before any vendor lookup. */
const SPECIAL: Array<[string, string]> = [
	['FFFFFFFFFFFF', 'broadcast'],
	['01005E', 'IPv4 multicast, RFC 1112'],
	['3333', 'IPv6 multicast, RFC 2464'],
	['0180C20000', 'IEEE 802.1 link-local: STP, LLDP, LACP']
];

let registry: Promise<Registry> | null = null;

export const parseRegistry = (text: string): Registry =>
	new Map(
		text
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const tab = line.indexOf('\t');
				return [line.slice(0, tab), line.slice(tab + 1)] as [string, string];
			})
	);

/** Load (once) the registry table; a failed load is retried next request. */
const loadRegistry = (fetchTable: () => Promise<Response>): Promise<Registry> => {
	registry ??= fetchTable()
		.then((response) => {
			if (!response.ok) throw new Error(`registry table returned ${response.status}`);
			return response.text();
		})
		.then(parseRegistry)
		.catch((err) => {
			registry = null;
			throw err;
		});
	return registry;
};

/** "aa:bb:cc" style, upper-case hex pairs; an odd trailing nibble stays alone. */
const pairs = (hex: string) => hex.match(/.{1,2}/g)!.join(':');

/** Strip separators (colon, dash, dot, space); 6–12 hex digits (a full MAC or a prefix). */
export const normaliseMac = (input: string): string | null => {
	const hex = input.replace(/[\s:.-]/g, '').toUpperCase();
	return /^[0-9A-F]{6,12}$/.test(hex) ? hex : null;
};

export const lookupMac = (registryTable: Registry, input: string): MacResult => {
	const hex = normaliseMac(input);
	if (!hex) {
		return {
			ok: false,
			error: 'invalid MAC address (e.g. 00:1a:2b:3c:4d:5e, 001a.2b3c.4d5e, or a 6+ digit prefix)',
			status: 400
		};
	}

	const firstOctet = parseInt(hex.slice(0, 2), 16);
	const locallyAdministered = (firstOctet & 0b10) !== 0;
	const special = SPECIAL.find(([prefix]) => hex.startsWith(prefix))?.[1] ?? null;
	let vendor: string | null = null;
	let block: string | null = null;
	// Locally administered addresses aren't IEEE-assigned, so there's no vendor to find.
	if (!locallyAdministered && !special) {
		for (const [length, name] of BLOCKS) {
			const hit = hex.length >= length ? registryTable.get(hex.slice(0, length)) : undefined;
			if (hit) {
				vendor = hit;
				block = `${name} ${pairs(hex.slice(0, length))}`;
				break;
			}
		}
	}

	return {
		ok: true,
		info: {
			mac: pairs(hex).toLowerCase(),
			vendor,
			block,
			special,
			multicast: (firstOctet & 0b1) !== 0,
			locallyAdministered
		}
	};
};

export const lookupMacWith = async (
	fetchTable: () => Promise<Response>,
	input: string
): Promise<MacResult> => {
	if (!normaliseMac(input)) return lookupMac(new Map(), input);
	try {
		return lookupMac(await loadRegistry(fetchTable), input);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		return { ok: false, error: `vendor table unavailable (${detail})`, status: 503 };
	}
};

export const formatMac = (m: MacInfo): string => {
	const vendor = m.special
		? `none (${m.special})`
		: m.locallyAdministered
			? 'none (locally administered, e.g. a randomized/private Wi-Fi address)'
			: (m.vendor ?? 'not found in the IEEE registry');
	const lines = [
		`MAC: ${m.mac}`,
		`Vendor: ${vendor}`,
		...(m.block ? [`Block: ${m.block}`] : []),
		`Type: ${m.multicast ? 'multicast' : 'unicast'}, ${m.locallyAdministered ? 'locally administered' : 'globally unique'}`,
		'Source: IEEE Registration Authority'
	];
	return lines.join('\n') + '\n';
};
