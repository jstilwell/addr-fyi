/**
 * Visitor info assembled from Cloudflare's request.cf object — populated at the
 * edge on every request, so no upstream lookup is needed for the visitor's own
 * geolocation. Fields are undefined in `vite dev` (no workerd); use
 * `npm run preview` to exercise them locally.
 */
export type ClientInfo = {
	ip: string;
	userAgent: string | null;
	country: string | null;
	region: string | null;
	city: string | null;
	zip: string | null;
	latitude: string | null;
	longitude: string | null;
	timezone: string | null;
	asn: number | null;
	org: string | null;
	colo: string | null;
	httpProtocol: string | null;
	tlsVersion: string | null;
	/** TCP round-trip time between the client and the edge, measured by Cloudflare (ms). */
	tcpRtt: number | null;
};

export const getClientInfo = (
	request: Request,
	cf: CfProperties | undefined,
	ip: string
): ClientInfo => ({
	ip,
	userAgent: request.headers.get('user-agent'),
	country: (cf?.country as string) ?? null,
	region: (cf?.region as string) ?? null,
	city: (cf?.city as string) ?? null,
	zip: (cf?.postalCode as string) ?? null,
	latitude: (cf?.latitude as string) ?? null,
	longitude: (cf?.longitude as string) ?? null,
	timezone: (cf?.timezone as string) ?? null,
	asn: (cf?.asn as number) ?? null,
	org: (cf?.asOrganization as string) ?? null,
	colo: (cf?.colo as string) ?? null,
	httpProtocol: (cf?.httpProtocol as string) ?? null,
	tlsVersion: (cf?.tlsVersion as string) ?? null,
	tcpRtt: (cf?.clientTcpRtt as number) ?? null
});
