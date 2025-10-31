/**
 * Child process script for running the benchmarked code in isolation.
 * Loads and executes the user-provided benchmark_target.js, measures execution time,
 */

import { main, setup } from "./benchmark_target.js";
import { buildPath } from "./utils.js";

function gc() {
    if (global.gc) {
        global.gc();
    } else {
        console.warn("No GC hook! Start Node.js with --expose-gc to enable forced garbage collection.");
    }
}

async function runMeasured() {
    const enginePath = process.env.BENCHMARK_ENGINE_PATH || buildPath();
    const engineModule = await import(enginePath);
    const setupData = setup(engineModule);
    const logs = [];
    // Patch console.debug to collect logs
    const origDebug = console.debug;
    console.debug = function(...args) {
        logs.push(args.map(String).join(" "));
        origDebug.apply(console, args);
    };
    gc();
    const start = performance.now();
    await main(engineModule, setupData);
    const end = performance.now();
    console.debug = origDebug;
    const durationMs = end - start;
    const eventTimings = parseEventTimings(logs);
    // Add total time as a regular event called 'Global'
    eventTimings["Global"] = durationMs;
    process.send({ eventTimings });
}

/**
 * Parses timing event logs and extracts event timings
 * from logs of the form:
 *   "evaluate all cells 83.20 ms"
 */
function parseEventTimings(logs) {
    const eventTimings = {};
    const timingRegex = /([\w .]+) (\d+(?:\.\d+)?) ms/;
    for (const line of logs) {
        const match = line.match(timingRegex);
        if (match) {
            const event = match[1].trim();
            const time = parseFloat(match[2]);
            eventTimings[event] = time;
        }
    }
    return eventTimings;
}

runMeasured();
