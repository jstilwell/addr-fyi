/**
 * Plaintext output is an API contract (see CLAUDE.md): these snapshots fail
 * on any change to existing lines, which means a major version bump.
 */
import { describe, expect, it } from 'vitest';
import { formatGeo, type GeoSuccess } from './geo';
import { formatWhois, type WhoisSummary } from './rdap';
import { kvText } from './respond';
import { formatWeather, type WeatherReport } from './weather';

const geo: GeoSuccess = {
	status: 'success',
	query: '8.8.8.8',
	country: 'United States',
	countryCode: 'US',
	regionName: 'Virginia',
	city: 'Ashburn',
	zip: '20149',
	lat: 39.03,
	lon: -77.5,
	timezone: 'America/New_York',
	isp: 'Google LLC',
	org: 'Google Public DNS',
	as: 'AS15169 Google LLC',
	reverse: 'dns.google',
	proxy: false,
	hosting: true
};

const whois: WhoisSummary = {
	kind: 'domain',
	query: 'example.com',
	name: 'EXAMPLE.COM',
	handle: '2336799_DOMAIN_COM-VRSN',
	status: 'client delete prohibited, client transfer prohibited',
	registrar: 'RESERVED-Internet Assigned Numbers Authority',
	organization: null,
	abuseContact: '',
	nameservers: ['a.iana-servers.net', 'b.iana-servers.net'],
	dnssec: 'signed',
	range: null,
	cidr: null,
	netType: null,
	country: null,
	registered: '1995-08-14',
	updated: '2024-08-14',
	expires: '2025-08-13',
	source: 'https://rdap.verisign.com/com/v1/domain/example.com'
};

const weather: WeatherReport = {
	location: {
		city: 'Charlottesville',
		region: 'Virginia',
		country: 'US',
		latitude: 38.0293,
		longitude: -78.4767
	},
	current: {
		condition: 'Partly cloudy',
		temperature: '72.1°F',
		feelsLike: '73.4°F',
		humidity: '61%',
		wind: '5.2 mp/h SW',
		gusts: '11.4 mp/h',
		cloudCover: '40%',
		pressure: '1016.2 hPa',
		precipitation: '0 inch'
	},
	today: {
		condition: 'Thunderstorm',
		high: '84.2°F',
		low: '63.5°F',
		precipitation: '0.12 inch',
		precipitationChance: '45%',
		sunrise: '07:02',
		sunset: '19:14'
	},
	alerts: []
};

describe('plaintext contract', () => {
	it('formatGeo', () => {
		expect(formatGeo(geo)).toMatchInlineSnapshot(`
			"IP: 8.8.8.8
			Country: United States (US)
			Region: Virginia
			City: Ashburn
			ZIP: 20149
			Latitude: 39.03
			Longitude: -77.5
			Timezone: America/New_York
			ISP: Google LLC
			Org: Google Public DNS
			AS: AS15169 Google LLC
			Reverse: dns.google
			Proxy: no
			Hosting: yes
			"
		`);
		expect(formatGeo({ ...geo, reverse: '', proxy: true })).toContain(
			'Reverse: (none)\nProxy: yes'
		);
	});

	it('formatWhois skips empty fields', () => {
		expect(formatWhois(whois)).toMatchInlineSnapshot(`
			"Domain: EXAMPLE.COM
			Handle: 2336799_DOMAIN_COM-VRSN
			Status: client delete prohibited, client transfer prohibited
			Registrar: RESERVED-Internet Assigned Numbers Authority
			Nameservers: a.iana-servers.net, b.iana-servers.net
			DNSSEC: signed
			Registered: 1995-08-14
			Updated: 2024-08-14
			Expires: 2025-08-13
			Source: https://rdap.verisign.com/com/v1/domain/example.com
			"
		`);
	});

	it('formatWhois labels IPs and ASNs', () => {
		expect(formatWhois({ ...whois, kind: 'ip', name: null })).toMatch(/^Network: example\.com\n/);
		expect(formatWhois({ ...whois, kind: 'asn' })).toMatch(/^ASN: EXAMPLE\.COM\n/);
	});

	it('formatWeather', () => {
		expect(formatWeather(weather)).toMatchInlineSnapshot(`
			"Weather: Charlottesville, Virginia, US
			Coordinates: 38.0293, -78.4767

			Now: 72.1°F (feels like 73.4°F) — Partly cloudy
			Humidity: 61%
			Wind: 5.2 mp/h SW (gusts 11.4 mp/h)
			Cloud cover: 40%
			Pressure: 1016.2 hPa
			Precipitation: 0 inch

			Today: Thunderstorm — high 84.2°F, low 63.5°F
			Precipitation: 0.12 inch (45% chance)
			Sunrise: 07:02
			Sunset: 19:14

			Alerts: none active
			"
		`);
	});

	it('formatWeather alert states', () => {
		expect(formatWeather({ ...weather, alerts: null })).toContain(
			'Alerts: unavailable for this location (US-only source)'
		);
		expect(
			formatWeather({
				...weather,
				alerts: [
					{
						event: 'Flood Watch',
						severity: 'Moderate',
						headline: 'Flood Watch issued',
						ends: '2026-09-27T06:00:00-04:00'
					}
				]
			})
		).toContain(
			'Alerts:\n! Flood Watch [Moderate] — until 2026-09-27 06:00\n  Flood Watch issued\n'
		);
	});

	it('kvText drops empty values and ends with a newline', () => {
		expect(kvText({ IP: '1.2.3.4', City: null, Zip: '', AS: undefined, Proxy: false })).toBe(
			'IP: 1.2.3.4\nProxy: false\n'
		);
	});
});
