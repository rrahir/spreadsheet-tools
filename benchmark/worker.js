/**
 * Child process: imports the scenario + the engine bundle, measures one run,
 * sends { eventTimings } back to the parent.
 *
 * Inputs via env:
 *   BENCHMARK_ENGINE_PATH  absolute path to the o-spreadsheet ESM bundle
 *   BENCHMARK_SCENARIO     absolute path to the scenario module (exports setup + benchmark)
 *   BENCHMARK_LABEL        label of the target (passed to scenario.setup as second arg)
 */

import { pathToFileURL } from "url";

function gc() {
    if (global.gc) global.gc();
    else console.warn("No GC hook! Start Node.js with --expose-gc to enable forced garbage collection.");
}

// Parses "EventName 12.34 ms" lines emitted by the scenario / engine via console.debug.
function parseEventTimings(logs) {
    const eventTimings = {};
    const re = /([\w .]+) (\d+(?:\.\d+)?) ms/;
    for (const line of logs) {
        const m = line.match(re);
        if (m) eventTimings[m[1].trim()] = parseFloat(m[2]);
    }
    return eventTimings;
}

const enginePath = process.env.BENCHMARK_ENGINE_PATH;
const scenarioPath = process.env.BENCHMARK_SCENARIO;
const label = process.env.BENCHMARK_LABEL;

const engineModule = await import(pathToFileURL(enginePath).href);
const scenario = await import(pathToFileURL(scenarioPath).href);

// Silence console.debug during setup, then capture during the measured region.
const origDebug = console.debug;
console.debug = () => {};
const setupData = scenario.setup(engineModule, label);

const logs = [];
console.debug = (...args) => { logs.push(args.map(String).join(" ")); };

gc();
const start = performance.now();
await scenario.benchmark(engineModule, setupData);
const durationMs = performance.now() - start;

console.debug = origDebug;

const eventTimings = parseEventTimings(logs);
eventTimings["Global"] = durationMs;
process.send({ eventTimings });
