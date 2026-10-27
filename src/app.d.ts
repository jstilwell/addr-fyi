// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** package.json version, injected by vite.config.ts. */
	const __APP_VERSION__: string;

	namespace Cloudflare {
		interface Env {
			/** Optional: lifts /certs off Cert Spotter's shared keyless quota.
			 * Set with `wrangler secret put CERTSPOTTER_API_KEY`. */
			CERTSPOTTER_API_KEY?: string;
		}
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
