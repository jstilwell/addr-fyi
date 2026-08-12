# addr.fyi

Your IP address and quick network lookups, deployed to Cloudflare Workers at
[addr.fyi](https://addr.fyi).

Every endpoint content-negotiates: browsers get a reactive UI, `curl` (and
anything else) gets pipe-friendly plaintext, and `Accept: application/json`
gets JSON.

## Endpoints

| Endpoint               | Returns                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `/`                    | your IP address                                                 |
| `/geo`                 | your IP + geolocation, straight from the edge (no lookup)       |
| `/json`                | everything we know about you, as JSON                           |
| `/find/{ip}`           | geolocation, ISP, ASN, rDNS, proxy/hosting flags for any IP     |
| `/dns/{query}?type=MX` | DNS via DoH — names get records, IPs get a reverse (PTR) lookup |
| `/weather`             | weather + alerts at your IP's location (Open-Meteo / NWS)       |
| `/whois/{query}`       | registration data via RDAP — accepts IP, domain, or ASN         |
| `/cidr/{range}`        | subnet calculator (IPv4 + IPv6), e.g. `/cidr/10.0.0.0/24`       |
| `/headers`             | your request headers, echoed back                               |
| `/ua`                  | your user agent                                                 |
| `/health`              | liveness check                                                  |

```sh
curl addr.fyi
curl addr.fyi/find/128.143.20.111
curl addr.fyi/dns/example.com?type=MX
curl addr.fyi/whois/AS13335
curl addr.fyi/cidr/192.168.1.0/26
curl -H 'Accept: application/json' addr.fyi/geo
```

## How it works

- **Visitor info is free.** `/`, `/geo`, and `/json` read Cloudflare's
  `request.cf` object — geolocation, ASN, and TLS details are attached to
  every request at the edge, so no upstream call is made.
- **Arbitrary lookups are cached.** `/find/{ip}` proxies ip-api.com and caches
  successful results in `caches.default` for 24h, keeping latency low and
  staying under the upstream rate limit.
- **DNS uses DoH.** `/dns` queries Cloudflare's `cloudflare-dns.com/dns-query`
  resolver; an IP argument is reversed to a PTR lookup automatically.
- **WHOIS is RDAP.** `/whois` bootstraps through rdap.org to the authoritative
  registry (ARIN/RIPE/Verisign/…) and caches results for 6h. gTLDs all support
  RDAP; some ccTLDs don't and will return "no record found".
- **One UI, one API.** The browser interface (Svelte 5 + Tailwind v4 +
  shadcn-svelte + Lucide) renders exactly what the plaintext API returns —
  each panel shows its equivalent `curl` command.

## Development

```sh
npm install
npm run dev        # Vite dev server (request.cf is unavailable here)
npm run preview    # build + run in the local workerd runtime (full fidelity)
```

## Deploying

```sh
npm run deploy
```

This builds the app and deploys it to Cloudflare Workers using `wrangler.jsonc`.
After changing bindings in `wrangler.jsonc`, rerun `npm run cf-typegen` to
regenerate `src/worker-configuration.d.ts`.
