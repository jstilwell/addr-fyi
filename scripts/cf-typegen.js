// Regenerate src/worker-configuration.d.ts, then drop the `mainModule` type
// wrangler derives from "main". It imports the build output
// (.svelte-kit/cloudflare/_worker.js), which drags the whole compiled bundle
// into svelte-check under checkJs. It only types ctx.exports (Durable
// Objects / named entrypoints), which this Worker doesn't use.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'src/worker-configuration.d.ts';

execFileSync('npx', ['wrangler', 'types', `./${target}`], { stdio: 'inherit' });

const source = readFileSync(target, 'utf8');
const stripped = source.replace(/\n\tinterface GlobalProps \{\n\t\tmainModule: [^\n]*\n\t\}/, '');
if (stripped === source) {
	throw new Error(`${target}: GlobalProps.mainModule block not found — update this script`);
}
writeFileSync(target, stripped);
