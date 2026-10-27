/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	plugins: [
		tailwindcss(),
		// `cloudflare:sockets` (used by /port) exists only in the Workers runtime;
		// the adapter handles `cloudflare:workers` alone. Builds leave it external
		// for the runtime to provide; vite dev swaps in a node:net stand-in.
		(() => {
			let serving = false;
			return {
				name: 'cloudflare-sockets',
				configResolved: (config: { command: string }) => {
					serving = config.command === 'serve';
				},
				resolveId: (id: string) =>
					id !== 'cloudflare:sockets'
						? undefined
						: serving
							? fileURLToPath(new URL('./src/lib/server/dev-sockets.ts', import.meta.url))
							: { id, external: true }
			};
		})(),
		sveltekit({
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: vitePreprocess(),

			adapter: adapter(),

			// Nonce-based CSP, sent as a header on every rendered page. Cloudflare
			// adds the nonce to the bot-detection script it injects
			// (/cdn-cgi/challenge-platform), which only works with a header, not
			// a <meta> tag. Inline style attributes come from the UI components.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'https://static.cloudflareinsights.com'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self', 'data:'],
					'connect-src': ['self', 'https://cloudflareinsights.com'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
