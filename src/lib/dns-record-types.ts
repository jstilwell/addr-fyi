/**
 * DNS record types the /dns endpoint accepts. Shared by the server (validation)
 * and the UI (record-type picker), so it must stay free of server-only imports.
 */

/** Forward-lookup types, most common first — the order the UI picker shows. */
export const FORWARD_RECORD_TYPES = [
	'A',
	'AAAA',
	'CNAME',
	'MX',
	'NS',
	'TXT',
	'SOA',
	'SRV',
	'CAA'
] as const;

/** Every accepted type, alphabetical (as listed in the endpoint's error message). */
export const RECORD_TYPES = [...FORWARD_RECORD_TYPES, 'PTR' as const].sort();

export type RecordType = (typeof RECORD_TYPES)[number];

export const isRecordType = (value: string): value is RecordType =>
	(RECORD_TYPES as readonly string[]).includes(value);
