// Rebuild the Workshop's Aetheria bundles (assets/js/vendor/aetheria/*.js) from Aetheria Experimental.
//
//   cd tools/aetheria-core
//   npm install            (once)
//   node build.mjs         (or: node build.mjs "D:\path\to\Aetheria Experiemental\src")
//
// The builders import Aetheria's own logic (card formats, lorebooks, presets, the Ages world engine)
// from these bundles, so when that logic changes in Aetheria, rebuild here and commit the bundles.
// Each file in entries/ lists the Aetheria modules one builder uses, as 'aetheria-src/<path>'.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(process.argv[2] || process.env.AETHERIA_SRC
  || 'C:\\Users\\gjens\\Documents\\Antigravity creations\\Aetheria Experiemental\\src');
const out = resolve(here, '../../assets/js/vendor/aetheria');

const common = {
  bundle: true, platform: 'browser', minify: true, legalComments: 'none', target: 'es2020',
  loader: { '.js': 'jsx' }, logLevel: 'warning',
  nodePaths: [join(here, 'node_modules')],
  alias: {
    'aetheria-src': src,
    '@capacitor/core': join(here, 'stubs/capacitor-core.js'),
    '@capacitor/filesystem': join(here, 'stubs/capacitor-none.js'),
    '@capawesome/capacitor-file-picker': join(here, 'stubs/capacitor-none.js'),
  },
};
const banner = (name, what = '') => ({ js: `/* Aetheria core: ${name}.${what} ${what ? 'built' : 'Built'} from Aetheria Experimental source for the Aetheria Archive Workshop. */` });

for (const name of ['character', 'lorebook', 'preset', 'world', 'world-starter']) {
  await build({ ...common, entryPoints: [join(here, 'entries', `${name}.js`)], format: 'esm', banner: banner(name), outfile: join(out, `${name}.js`) });
  console.log(`built ${name}.js`);
}
// The World builder's bake worker, as a classic worker script beside world.js.
await build({ ...common, entryPoints: [join(here, 'entries/world-worker.js')], format: 'iife', banner: banner('world-worker', ' ages-engine/worker.ts,'), outfile: join(out, 'world-worker.js') });
console.log('built world-worker.js');

// ages-engine/workerClient.ts asks for new URL('./worker.ts', import.meta.url), which only a bundler
// that follows workers resolves. Point it at world-worker.js, and add a switch the World builder flips
// (globalThis.__aeWorldNoWorker) to send bakes to the main thread when the worker cannot start.
const file = join(out, 'world.js');
let text = readFileSync(file, 'utf8');
const swaps = [
  ['new URL("./worker.ts",import.meta.url)', 'new URL("./world-worker.js",import.meta.url)'],
  ['typeof Worker>"u"', '(typeof Worker>"u"||globalThis.__aeWorldNoWorker)'],
];
for (const [from, to] of swaps) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`world.js: expected one "${from}", found ${n}. Aetheria's worker client changed; update build.mjs.`);
  text = text.replace(from, to);
}
writeFileSync(file, text);
console.log('pointed world.js at world-worker.js');
