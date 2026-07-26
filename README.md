# quick-ip

A tiny IP lookup service deployed to Cloudflare Workers.

- Visit `/` to see your IP address.
- Visit `/find/{ip_address}` to look up the location of an IP address.

`/` content-negotiates: browsers get the HTML page, everything else (curl, scripts)
gets plain text.

## Development

```sh
npm install
npm run dev        # Vite dev server
npm run preview    # build + run in the local workerd runtime
```

## Deploying

```sh
npm run deploy
```

This builds the app and deploys it to Cloudflare Workers using `wrangler.jsonc`.
After changing bindings in `wrangler.jsonc`, rerun `npm run cf-typegen` to
regenerate `src/worker-configuration.d.ts`.
