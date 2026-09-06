// Copies the Pyodide runtime into static/ so the browser loads it as plain assets, alongside the
// judge worker and the shared driver. Same approach as scripts/copy-monaco.mjs: keeping these out
// of the Vite/Workers bundles avoids the resolver problems that forced Monaco out too.
//
// Only the core runtime is copied. Pyodide's package wheels are not needed: the judge runs pure
// algorithmic Python against the standard library.
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'node_modules', 'pyodide');
const dest = join('static', 'pyodide');

if (!existsSync(src)) throw new Error(`pyodide not found at ${src} — run: pnpm add -D pyodide`);

const runtime = [
	'pyodide.mjs',
	'pyodide.asm.mjs',
	'pyodide.asm.wasm',
	'python_stdlib.zip',
	'pyodide-lock.json'
];

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

let bytes = 0;
for (const file of runtime) {
	const from = join(src, file);
	if (!existsSync(from)) throw new Error(`expected pyodide file missing: ${from}`);
	copyFileSync(from, join(dest, file));
	bytes += statSync(from).size;
}

// The worker and the driver are source, not vendored artefacts; they live in src/lib/pyodide/ and
// are copied here so the worker can load both by relative URL. driver.py is the single source of
// truth shared with scripts/generate-tests.py — never edit the copy in static/.
for (const [from, to] of [
	[join('src', 'lib', 'pyodide', 'worker.js'), 'worker.js'],
	[join('src', 'lib', 'pyodide', 'driver.py'), 'driver.py']
]) {
	copyFileSync(from, join(dest, to));
	bytes += statSync(from).size;
}

console.log(`copied pyodide -> ${dest} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
