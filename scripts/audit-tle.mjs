#!/usr/bin/env node
/**
 * Times the TLE cases (static/tle/<slug>.json, generated from scripts/tle/) in Pyodide, the same
 * runtime the browser judges in.
 *
 *   node scripts/audit-tle.mjs --reference [slug ...]
 *       The reference solution must get through the WHOLE Submit -- suite plus TLE cases -- in
 *       REFERENCE_BUDGET_MS, under a seventh of the judge's 15 s, so a machine several times slower
 *       still passes. CI runs this for every problem.
 *
 *   node scripts/audit-tle.mjs --naive [slug ...]
 *       Every slow solution registered with naive() must (a) pass the regular suite, proving it is
 *       a CORRECT solution that is merely slow, and (b) fail to finish the TLE cases within the
 *       judge's 15 s. Each run is a child process killed at the limit: a busy Pyodide cannot be
 *       interrupted from inside. Slow by design, so not in CI.
 *
 * Exit code 1 on any failure.
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JUDGE_LIMIT_MS = 15_000; // TIME_LIMIT_MS in src/lib/pyodide/client.ts
const REFERENCE_BUDGET_MS = 2_000;

async function bootJudge() {
	const { loadPyodide } = await import('pyodide');
	const py = await loadPyodide({ indexURL: join(ROOT, 'node_modules', 'pyodide') });
	py.FS.mkdirTree('/lc');
	py.FS.writeFile('/lc/lc_driver.py', readFileSync(join(ROOT, 'src/lib/pyodide/driver.py'), 'utf8'));
	const judge = py.runPython(`
import json, sys
sys.path.insert(0, '/lc')
import lc_driver
def _judge(s, sp, cs): return json.dumps(lc_driver.judge(s, json.loads(sp), json.loads(cs)))
_judge`);
	const usable = py.runPython('lc_driver.usable_source');
	return { judge, usable };
}

const suiteOf = (slug) => JSON.parse(readFileSync(join(ROOT, 'data/tests', `${slug}.json`), 'utf8'));
const tleOf = (slug) => {
	const p = join(ROOT, 'static/tle', `${slug}.json`);
	return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).cases : [];
};
const problems = JSON.parse(readFileSync(join(ROOT, 'data/neetcode150.json'), 'utf8'));
const codeOf = (slug) => problems.find((p) => p.slug === slug)?.code;

function summarize(results) {
	const bad = results.find((r) => !r.ok);
	return { passed: results.filter((r) => r.ok).length, total: results.length, bad };
}

// ---------- child: judge one source against a set of cases, print elapsed ms ----------
if (process.argv[2] === '--child') {
	const job = JSON.parse(readFileSync(process.argv[3], 'utf8'));
	const { judge } = await bootJudge();
	const t0 = performance.now();
	const r = JSON.parse(judge(job.source, JSON.stringify(job.suite), JSON.stringify(job.cases)));
	const ms = Math.round(performance.now() - t0);
	process.stdout.write(JSON.stringify({ ms, ...summarize(r), bad: undefined }) + '\n');
	process.exit(0);
}

const mode = process.argv[2];
let slugs = process.argv.slice(3);
if (mode !== '--reference' && mode !== '--naive') {
	console.error('usage: node scripts/audit-tle.mjs --reference|--naive [slug ...]');
	process.exit(2);
}

let failed = 0;

if (mode === '--reference') {
	if (!slugs.length) slugs = problems.map((p) => p.slug);
	const { judge, usable } = await bootJudge();
	let checked = 0;
	for (const slug of slugs) {
		const big = tleOf(slug);
		if (!big.length) continue;
		checked++;
		const suite = suiteOf(slug);
		const source = usable(readFileSync(join(ROOT, 'static/solutions/python', `${codeOf(slug)}.py`), 'utf8'));
		const cases = [...suite.cases, ...big];
		const t0 = performance.now();
		const r = summarize(JSON.parse(judge(source, JSON.stringify(suite), JSON.stringify(cases))));
		const ms = Math.round(performance.now() - t0);
		const ok = r.passed === r.total && ms <= REFERENCE_BUDGET_MS;
		if (!ok) failed++;
		const why = r.passed !== r.total ? ` WRONG on ${r.total - r.passed} case(s): ${JSON.stringify(r.bad).slice(0, 160)}` : ms > REFERENCE_BUDGET_MS ? ` over the ${REFERENCE_BUDGET_MS} ms budget` : '';
		console.log(`${ok ? 'ok  ' : 'FAIL'} ${slug.padEnd(58)} reference ${String(ms).padStart(5)} ms for ${cases.length} cases (${big.length} TLE)${why}`);
	}
	console.log(`\n${checked - failed}/${checked} problems with TLE cases: reference within ${REFERENCE_BUDGET_MS} ms`);
}

if (mode === '--naive') {
	const registry = JSON.parse(
		execFileSync('python3', ['-c', 'import sys, json; sys.path.insert(0, "scripts"); import tle; tle.load(); print(json.dumps({"naive": tle.NAIVE, "none": tle.NO_TLE}))'], {
			cwd: ROOT,
			encoding: 'utf8'
		})
	);
	if (!slugs.length) slugs = Object.keys(registry.naive);
	const dir = mkdtempSync(join(tmpdir(), 'audit-tle-'));
	const runChild = (job, timeoutMs) => {
		const file = join(dir, 'job.json');
		writeFileSync(file, JSON.stringify(job));
		const t0 = performance.now();
		const p = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', file], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1 << 20 });
		const wall = Math.round(performance.now() - t0);
		if (p.error?.code === 'ETIMEDOUT' || p.signal) return { timedOut: true, wall };
		const line = (p.stdout || '').trim().split('\n').pop();
		try {
			return { timedOut: false, wall, ...JSON.parse(line) };
		} catch {
			return { timedOut: false, wall, crashed: (p.stderr || p.stdout || '').slice(-300) };
		}
	};
	for (const slug of slugs) {
		const big = tleOf(slug);
		const list = registry.naive[slug] ?? [];
		if (!big.length || !list.length) {
			failed++;
			console.log(`FAIL ${slug}: ${!big.length ? 'no TLE cases' : 'no naive solution registered'}`);
			continue;
		}
		const suite = suiteOf(slug);
		for (const [label, source] of list) {
			// Correct on the regular suite, or it is not a slow solution, just a wrong one.
			const small = runChild({ source, suite, cases: suite.cases }, 120_000);
			if (small.timedOut || small.crashed || small.passed !== small.total) {
				failed++;
				console.log(`FAIL ${slug} [${label}]: not correct on the regular suite (${small.timedOut ? 'timed out' : small.crashed ?? `${small.passed}/${small.total}`})`);
				continue;
			}
			// Boot is excluded from the judge's budget, so allow for it on top of the limit.
			const r = runChild({ source, suite, cases: big }, JUDGE_LIMIT_MS + 10_000);
			const ok = r.timedOut || (r.ms ?? 0) > JUDGE_LIMIT_MS;
			if (!ok) failed++;
			console.log(`${ok ? 'ok  ' : 'FAIL'} ${slug.padEnd(58)} [${label}] ${r.timedOut ? `killed after ${r.wall} ms` : `finished the TLE cases in ${r.ms} ms`}`);
		}
	}
	const none = Object.entries(registry.none);
	if (none.length) console.log(`\n${none.length} problem(s) where no input within the constraints can time out a correct solution:\n` + none.map(([s, w]) => `  ${s}: ${w}`).join('\n'));
}

process.exit(failed ? 1 : 0);
