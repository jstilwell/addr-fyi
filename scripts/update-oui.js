// Rebuild static/data/oui.tsv — the MAC vendor table behind /mac — from the
// IEEE Registration Authority's public registries: MA-L (24-bit prefixes),
// MA-M (28-bit) and MA-S (36-bit). Output is one `PREFIX<TAB>Organization`
// line per assignment, prefix in upper-case hex, sorted. Run occasionally
// (`npm run update-oui`); the IEEE adds assignments every week.
import { writeFileSync } from 'node:fs';

const target = 'static/data/oui.tsv';
const REGISTRIES = [
	'https://standards-oui.ieee.org/oui/oui.csv',
	'https://standards-oui.ieee.org/oui28/mam.csv',
	'https://standards-oui.ieee.org/oui36/oui36.csv'
];

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF. */
const parseCsv = (text) => {
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (ch === '"') {
				quoted = false;
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ',') {
			row.push(field);
			field = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += ch;
		}
	}
	if (field || row.length) rows.push([...row, field]);
	return rows;
};

const entries = new Map();
for (const url of REGISTRIES) {
	// The IEEE site rejects requests without a browser-like User-Agent.
	const response = await fetch(url, {
		headers: { 'user-agent': 'Mozilla/5.0 (addr.fyi oui update)' }
	});
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	const [header, ...rows] = parseCsv(await response.text());
	const col = (name) => header.indexOf(name);
	const [assignment, organization] = [col('Assignment'), col('Organization Name')];
	for (const row of rows) {
		const prefix = row[assignment]?.trim().toUpperCase();
		const name = row[organization]?.replace(/\s+/g, ' ').trim();
		if (prefix && /^[0-9A-F]{6,9}$/.test(prefix) && name) entries.set(prefix, name);
	}
	console.log(`${url}: ${rows.length} rows`);
}

const lines = [...entries].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, n]) => `${p}\t${n}`);
writeFileSync(target, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} prefixes to ${target}`);
