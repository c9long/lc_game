// Copies Monaco's prebuilt AMD build into static/ so the browser loads it as plain assets.
// Keeps Monaco (and its web workers) out of the Vite/Workers bundles entirely.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const src = join(process.cwd(), 'node_modules', 'monaco-editor', 'min', 'vs');
const dest = join('static', 'monaco', 'vs');
if (!existsSync(src)) throw new Error(`monaco build not found at ${src}`);
rmSync(join('static', 'monaco'), { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copied monaco -> ${dest}`);
