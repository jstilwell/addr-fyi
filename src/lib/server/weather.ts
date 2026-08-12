/**
 * Weather for the visitor's IP-derived location. Conditions and forecast come
 * from Open-Meteo (free, no key); active alerts come from the US National
 * Weather Service when the visitor is in the US (the NWS API is US-only).
 */

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const NWS_ALERTS = 'https://api.weather.gov/alerts/active';

/** WMO weather interpretation codes → human text. */
const WMO_TEXT: Record<number, string> = {
	0: 'Clear sky',
	1: 'Mainly clear',
	2: 'Partly cloudy',
	3: 'Overcast',
	45: 'Fog',
	48: 'Depositing rime fog',
	51: 'Light drizzle',
	53: 'Drizzle',
	55: 'Dense drizzle',
	56: 'Light freezing drizzle',
	57: 'Freezing drizzle',
	61: 'Light rain',
	63: 'Rain',
	65: 'Heavy rain',
	66: 'Light freezing rain',
	67: 'Freezing rain',
	71: 'Light snow',
	73: 'Snow',
	75: 'Heavy snow',
	77: 'Snow grains',
	80: 'Light rain showers',
	81: 'Rain showers',
	82: 'Violent rain showers',
	85: 'Snow showers',
	86: 'Heavy snow showers',
	95: 'Thunderstorm',
	96: 'Thunderstorm with hail',
	99: 'Thunderstorm with heavy hail'
};

export const wmoText = (code: number | undefined): string =>
	code === undefined ? 'Unknown' : (WMO_TEXT[code] ?? `Unknown (code ${code})`);

const COMPASS = [
	'N',
	'NNE',
	'NE',
	'ENE',
	'E',
	'ESE',
	'SE',
	'SSE',
	'S',
	'SSW',
	'SW',
	'WSW',
	'W',
	'WNW',
	'NW',
	'NNW'
];

export const compass = (degrees: number): string => COMPASS[Math.round(degrees / 22.5) % 16];

type OpenMeteoResponse = {
	current: {
		temperature_2m: number;
		apparent_temperature: number;
		relative_humidity_2m: number;
		precipitation: number;
		weather_code: number;
		cloud_cover: number;
		pressure_msl: number;
		wind_speed_10m: number;
		wind_direction_10m: number;
		wind_gusts_10m: number;
	};
	current_units: Record<string, string>;
	daily: {
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		precipitation_sum: number[];
		precipitation_probability_max: (number | null)[];
		sunrise: string[];
		sunset: string[];
	};
	daily_units: Record<string, string>;
};

export type WeatherAlert = {
	event: string;
	severity: string;
	headline: string | null;
	ends: string | null;
};

export type WeatherReport = {
	location: {
		city: string | null;
		region: string | null;
		country: string;
		latitude: number;
		longitude: number;
	};
	current: {
		condition: string;
		temperature: string;
		feelsLike: string;
		humidity: string;
		wind: string;
		gusts: string;
		cloudCover: string;
		pressure: string;
		precipitation: string;
	};
	today: {
		condition: string;
		high: string;
		low: string;
		precipitation: string;
		precipitationChance: string | null;
		sunrise: string;
		sunset: string;
	};
	/** null = alert source unavailable for this location (non-US) or errored. */
	alerts: WeatherAlert[] | null;
};

export type WeatherResult =
	{ ok: true; report: WeatherReport } | { ok: false; error: string; status: number };

type NwsAlertsResponse = {
	features?: Array<{
		properties?: {
			event?: string;
			severity?: string;
			headline?: string;
			ends?: string | null;
			expires?: string | null;
		};
	}>;
};

/** Best-effort NWS alerts; null means "could not determine", not "none". */
const fetchAlerts = async (
	fetcher: typeof fetch,
	latitude: number,
	longitude: number
): Promise<WeatherAlert[] | null> => {
	try {
		const response = await fetcher(`${NWS_ALERTS}?point=${latitude},${longitude}`, {
			// api.weather.gov requires a User-Agent identifying the caller.
			headers: {
				accept: 'application/geo+json',
				'user-agent': 'addr.fyi/1.0 (jesse@stilwe.com)'
			},
			signal: AbortSignal.timeout(6000)
		});
		if (!response.ok) return null;
		const data = (await response.json()) as NwsAlertsResponse;
		return (data.features ?? []).map((feature) => ({
			event: feature.properties?.event ?? 'Alert',
			severity: feature.properties?.severity ?? 'Unknown',
			headline: feature.properties?.headline ?? null,
			ends: feature.properties?.ends ?? feature.properties?.expires ?? null
		}));
	} catch {
		return null;
	}
};

export const getWeather = async (
	fetcher: typeof fetch,
	options: {
		latitude: number;
		longitude: number;
		country: string;
		city: string | null;
		region: string | null;
	}
): Promise<WeatherResult> => {
	const { latitude, longitude, country } = options;
	const imperial = country === 'US';

	const params = new URLSearchParams({
		latitude: latitude.toFixed(4),
		longitude: longitude.toFixed(4),
		current: [
			'temperature_2m',
			'apparent_temperature',
			'relative_humidity_2m',
			'precipitation',
			'weather_code',
			'cloud_cover',
			'pressure_msl',
			'wind_speed_10m',
			'wind_direction_10m',
			'wind_gusts_10m'
		].join(','),
		daily: [
			'weather_code',
			'temperature_2m_max',
			'temperature_2m_min',
			'precipitation_sum',
			'precipitation_probability_max',
			'sunrise',
			'sunset'
		].join(','),
		timezone: 'auto',
		forecast_days: '1'
	});
	if (imperial) {
		params.set('temperature_unit', 'fahrenheit');
		params.set('wind_speed_unit', 'mph');
		params.set('precipitation_unit', 'inch');
	}

	let data: OpenMeteoResponse;
	let alerts: WeatherAlert[] | null;
	try {
		[data, alerts] = await Promise.all([
			fetcher(`${OPEN_METEO}?${params}`, { signal: AbortSignal.timeout(6000) }).then((response) => {
				if (!response.ok) throw new Error(`weather service returned ${response.status}`);
				return response.json() as Promise<OpenMeteoResponse>;
			}),
			imperial ? fetchAlerts(fetcher, latitude, longitude) : Promise.resolve(null)
		]);
	} catch (err) {
		const detail = err instanceof Error ? err.message : 'weather service unavailable';
		return { ok: false, error: detail, status: 504 };
	}

	const units = data.current_units;
	const dailyUnits = data.daily_units;
	const current = data.current;
	const daily = data.daily;
	const chance = daily.precipitation_probability_max[0];

	return {
		ok: true,
		report: {
			location: {
				city: options.city,
				region: options.region,
				country,
				latitude,
				longitude
			},
			current: {
				condition: wmoText(current.weather_code),
				temperature: `${current.temperature_2m}${units.temperature_2m}`,
				feelsLike: `${current.apparent_temperature}${units.apparent_temperature}`,
				humidity: `${current.relative_humidity_2m}${units.relative_humidity_2m}`,
				wind: `${current.wind_speed_10m} ${units.wind_speed_10m} ${compass(current.wind_direction_10m)}`,
				gusts: `${current.wind_gusts_10m} ${units.wind_gusts_10m}`,
				cloudCover: `${current.cloud_cover}${units.cloud_cover}`,
				pressure: `${current.pressure_msl} ${units.pressure_msl}`,
				precipitation: `${current.precipitation} ${units.precipitation}`
			},
			today: {
				condition: wmoText(daily.weather_code[0]),
				high: `${daily.temperature_2m_max[0]}${dailyUnits.temperature_2m_max}`,
				low: `${daily.temperature_2m_min[0]}${dailyUnits.temperature_2m_min}`,
				precipitation: `${daily.precipitation_sum[0]} ${dailyUnits.precipitation_sum}`,
				precipitationChance: chance === null || chance === undefined ? null : `${chance}%`,
				sunrise: daily.sunrise[0]?.slice(11, 16) ?? '',
				sunset: daily.sunset[0]?.slice(11, 16) ?? ''
			},
			alerts
		}
	};
};

export const formatWeather = (report: WeatherReport): string => {
	const { location, current, today, alerts } = report;
	const place = [location.city, location.region, location.country].filter(Boolean).join(', ');

	const lines = [
		`Weather: ${place}`,
		`Coordinates: ${location.latitude}, ${location.longitude}`,
		'',
		`Now: ${current.temperature} (feels like ${current.feelsLike}) — ${current.condition}`,
		`Humidity: ${current.humidity}`,
		`Wind: ${current.wind} (gusts ${current.gusts})`,
		`Cloud cover: ${current.cloudCover}`,
		`Pressure: ${current.pressure}`,
		`Precipitation: ${current.precipitation}`,
		'',
		`Today: ${today.condition} — high ${today.high}, low ${today.low}`,
		`Precipitation: ${today.precipitation}${today.precipitationChance ? ` (${today.precipitationChance} chance)` : ''}`,
		`Sunrise: ${today.sunrise}`,
		`Sunset: ${today.sunset}`,
		''
	];

	if (alerts === null) {
		lines.push('Alerts: unavailable for this location (US-only source)');
	} else if (alerts.length === 0) {
		lines.push('Alerts: none active');
	} else {
		lines.push('Alerts:');
		for (const alert of alerts) {
			const until = alert.ends ? ` — until ${alert.ends.slice(0, 16).replace('T', ' ')}` : '';
			lines.push(`! ${alert.event} [${alert.severity}]${until}`);
			if (alert.headline) lines.push(`  ${alert.headline}`);
		}
	}

	return lines.join('\n') + '\n';
};
