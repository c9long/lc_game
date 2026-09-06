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

let pyodide = null;
let judgeFn = null;
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

_judge
`);
}

self.onmessage = async (event) => {
	const { id, type, source, spec, cases } = event.data ?? {};
	try {
		if (type === 'boot') {
			await boot();
			self.postMessage({ id, ok: true, booted: true });
			return;
		}

		if (type === 'judge') {
			await boot();
			stdout = [];
			const started = performance.now();
			const raw = judgeFn(source, JSON.stringify(spec), JSON.stringify(cases));
			self.postMessage({
				id,
				ok: true,
				results: JSON.parse(raw),
				stdout: stdout.join('\n'),
				elapsedMs: Math.round(performance.now() - started)
			});
			return;
		}

		self.postMessage({ id, ok: false, error: `unknown message type: ${type}` });
	} catch (e) {
		self.postMessage({ id, ok: false, error: e?.message ?? String(e), stdout: stdout.join('\n') });
	}
};
