// Imports the NeetCode 150 curriculum and reference solutions from a local clone of
// https://github.com/neetcode-gh/leetcode (MIT). Usage:
//   git clone --depth 1 https://github.com/neetcode-gh/leetcode.git /tmp/neetcode
//   node scripts/import-neetcode.ts /tmp/neetcode
// Writes data/neetcode150.json and static/solutions/<lang>/<code>.<ext> (+ LICENSE).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) {
	console.error('usage: node scripts/import-neetcode.ts <path to neetcode-gh/leetcode clone>');
	process.exit(1);
}

const LANGS: Record<string, string> = { python: 'py', go: 'go', csharp: 'cs', cpp: 'cpp', rust: 'rs' };

type SiteEntry = {
	neetcode150?: boolean;
	blind75?: boolean;
	problem: string;
	pattern: string;
	link: string;
	difficulty: string;
	code: string;
	premium?: boolean;
	freeLink?: string;
};

const all: SiteEntry[] = JSON.parse(readFileSync(join(src, '.problemSiteData.json'), 'utf8'));
const entries = all.filter((e) => e.neetcode150);

const problems = entries.map((e, order) => ({
	order,
	code: e.code,
	slug: e.link.replace(/\/+$/, ''),
	title: e.problem,
	pattern: e.pattern,
	difficulty: e.difficulty,
	blind75: Boolean(e.blind75),
	premium: Boolean(e.premium),
	solutions: Object.fromEntries(
		Object.entries(LANGS).map(([lang, ext]) => [lang, existsSync(join(src, lang, `${e.code}.${ext}`))])
	) as Record<string, boolean>
}));

let copied = 0;
for (const p of problems) {
	for (const [lang, ext] of Object.entries(LANGS)) {
		if (!p.solutions[lang]) continue;
		mkdirSync(join('static/solutions', lang), { recursive: true });
		copyFileSync(join(src, lang, `${p.code}.${ext}`), join('static/solutions', lang, `${p.code}.${ext}`));
		copied++;
	}
}
mkdirSync('static/solutions', { recursive: true });
copyFileSync(join(src, 'LICENSE'), 'static/solutions/LICENSE');
writeFileSync('data/neetcode150.json', JSON.stringify(problems, null, 2) + '\n');

const patterns = [...new Set(problems.map((p) => p.pattern))];
console.log(`problems: ${problems.length}, solution files copied: ${copied}`);
console.log(`patterns (${patterns.length}):`, patterns.join(' | '));
console.log('premium:', problems.filter((p) => p.premium).map((p) => p.slug).join(', ') || 'none');
for (const lang of Object.keys(LANGS)) {
	const missing = problems.filter((p) => !p.solutions[lang]).map((p) => p.code);
	console.log(`${lang} missing (${missing.length}):`, missing.join(', ') || 'none');
}
