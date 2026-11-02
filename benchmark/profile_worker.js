/**
 * Child process: imports the scenario + the engine bundle, then captures a
 * profile (CPU or allocation) over a few measured benchmark() runs and writes
 * the raw profile JSON to a file. Mirrors worker.js's setup/silence pattern.
 *
 * Inputs via env:
 *   BENCHMARK_ENGINE_PATH  absolute path to the o-spreadsheet ESM bundle
 *   BENCHMARK_SCENARIO     absolute path to the scenario module (exports setup + benchmark)
 *   BENCHMARK_LABEL        label of the target (passed to scenario.setup as second arg)
 *   PROFILE_MODE           "cpu" | "memory"
 *   PROFILE_OUT            absolute path to write the raw profile JSON to
 *   PROFILE_RUNS           number of measured benchmark() runs
 *
 * For memory mode the process must be started with --expose-gc.
 */

import fs from "fs";
import { Session } from "inspector";
import { pathToFileURL } from "url";

const WARMUP_RUNS = 2;

const enginePath = process.env.BENCHMARK_ENGINE_PATH;
const scenarioPath = process.env.BENCHMARK_SCENARIO;
const label = process.env.BENCHMARK_LABEL;
const mode = process.env.PROFILE_MODE;
const outPath = process.env.PROFILE_OUT;
const runs = parseInt(process.env.PROFILE_RUNS, 10);

const engineModule = await import(pathToFileURL(enginePath).href);
const scenario = await import(pathToFileURL(scenarioPath).href);

// Silence console.debug for the whole profiled region (setup + runs).
const origDebug = console.debug;
console.debug = () => {};
const setupData = scenario.setup(engineModule, label);

// Warmup so JIT/inline caches are warm before we start measuring.
for (let i = 0; i < WARMUP_RUNS; i++) {
    await scenario.benchmark(engineModule, setupData);
}

const session = new Session();
session.connect();

function post(method, params) {
    return new Promise((resolve, reject) => {
        session.post(method, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

async function runBenchmarks() {
    for (let i = 0; i < runs; i++) {
        await scenario.benchmark(engineModule, setupData);
    }
}

let profile;
if (mode === "cpu") {
    await post("Profiler.enable");
    await post("Profiler.start");
    await runBenchmarks();
    ({ profile } = await post("Profiler.stop"));
} else if (mode === "memory") {
    if (global.gc) global.gc();
    else console.warn("No GC hook! Start Node.js with --expose-gc.");
    await post("HeapProfiler.enable");
    await post("HeapProfiler.startSampling", { samplingInterval: 4096 });
    await runBenchmarks();
    ({ profile } = await post("HeapProfiler.stopSampling"));
} else {
    console.debug = origDebug;
    throw new Error(`unknown PROFILE_MODE: ${mode}`);
}

session.disconnect();
console.debug = origDebug;

fs.writeFileSync(outPath, JSON.stringify(profile));
process.send({ ok: true, out: outPath });
