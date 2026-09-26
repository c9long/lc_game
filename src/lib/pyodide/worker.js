// Pyodide judge worker.
//
// Copied to static/pyodide/worker.js by scripts/copy-pyodide.mjs and loaded as a module worker
// straight from that URL, so Vite never bundles it. Monaco was moved to static/ for the same
// reason: the bundler cannot resolve these runtimes and does not need to.
//
// Everything here is deliberately thin. The judging itself lives in driver.py, which is the same
// file the build-time oracle runs, so a verdict in the browser matches the expectations in
// data/tests/. Timeouts are handled by the main thread terminating this worker: Pyodide can only
// interrupt itself via a SharedArrayBuffer, which needs COOP/COEP headers we do not want to take on.

import { loadPyodide } from './pyodide.mjs';

const here = new URL('./', import.meta.url).href;

/** Bumped whenever a message or result shape changes. Must match PROTOCOL in client.ts. */
const PROTOCOL = 2;

let pyodide = null;
let judgeFn = null;
let customFn = null;
let stdout = [];

async function boot() {
	if (judgeFn) return;

	pyodide = await loadPyodide({ indexURL: here });
	pyodide.setStdout({ batched: (line) => stdout.push(line) });
	pyodide.setStderr({ batched: (line) => stdout.push(line) });

	const driverSource = await (await fetch(new URL('./driver.py', here))).text();
	pyodide.FS.mkdirTree('/lc');
	pyodide.FS.writeFile('/lc/lc_driver.py', driverSource);

	// JSON in and JSON out: it keeps Python objects from leaking across as proxies that must be
	// destroyed by hand, and it is the same representation the test files already use.
	judgeFn = pyodide.runPython(`
import json, sys
sys.path.insert(0, '/lc')
import lc_driver

def _judge(source, spec_json, cases_json):
    return json.dumps(lc_driver.judge(source, json.loads(spec_json), json.loads(cases_json)))

def _custom(source, ref_source, spec_json, inputs_json):
    return json.dumps(lc_driver.custom(source, ref_source, json.loads(spec_json), json.loads(inputs_json)))

_judge
`);
	customFn = pyodide.globals.get('_custom');
}

self.onmessage = async (event) => {
	const { id, type, source, refSource, specJson, casesJson, inputsJson } = event.data ?? {};
	try {
		if (type === 'boot') {
			await boot();
			self.postMessage({ id, protocol: PROTOCOL, ok: true, booted: true });
			return;
		}

		if (type === 'judge') {
			await boot();
			stdout = [];
			const started = performance.now();
			// Already JSON: the client serialises before posting, because a Svelte $state proxy
			// cannot be structured-cloned across the worker boundary.
			const raw = judgeFn(source, specJson, casesJson);
			self.postMessage({
				id,
				protocol: PROTOCOL,
				ok: true,
				results: JSON.parse(raw),
				stdout: stdout.join('\n'),
				elapsedMs: Math.round(performance.now() - started)
			});
			return;
		}

		if (type === 'custom') {
			await boot();
			stdout = [];
			const started = performance.now();
			// Per-case stdout comes back inside each result; the driver captures it around each call.
			const raw = customFn(source, refSource ?? null, specJson, inputsJson);
			self.postMessage({
				id,
				protocol: PROTOCOL,
				ok: true,
				results: JSON.parse(raw),
				stdout: stdout.join('\n'),
				elapsedMs: Math.round(performance.now() - started)
			});
			return;
		}

		self.postMessage({ id, protocol: PROTOCOL, ok: false, error: `unknown message type: ${type}` });
	} catch (e) {
		self.postMessage({ id, protocol: PROTOCOL, ok: false, error: e?.message ?? String(e), stdout: stdout.join('\n') });
	}
};
