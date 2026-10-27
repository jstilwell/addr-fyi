/**
 * Dev-only stand-in for `cloudflare:sockets`, which only exists in the Workers
 * runtime. vite.config.ts aliases the module to this file under `vite dev`;
 * production builds keep the real import. Implements just the slice of
 * connect() that /port uses: `opened` and `close()`.
 */
import { createConnection } from 'node:net';

export const connect = ({ hostname, port }: { hostname: string; port: number }) => {
	const socket = createConnection({ host: hostname, port });
	const opened = new Promise<void>((resolve, reject) => {
		socket.once('connect', () => resolve());
		socket.once('error', reject);
	});
	return {
		opened,
		close: async () => {
			socket.destroy();
		}
	};
};
