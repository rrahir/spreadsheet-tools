// runner.js
// Runs run.js in a child process, measures execution time, and returns timing to parent

import { main, setup } from "./benchmark_target.js";
import { buildPath } from "./perf_bench.js";

async function runMeasured() {
    const setupData = setup();
    const engineModule = await import(buildPath());
    const logs = [];
    // Patch console.debug to collect logs
    const origDebug = console.debug;
    console.debug = function(...args) {
        logs.push(args.map(String).join(" "));
        origDebug.apply(console, args);
    };
    const start = performance.now();
    await main(engineModule, setupData);
    const end = performance.now();
    console.debug = origDebug;
    const durationMs = end - start;
    // Parse logs for event timings
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
    // Add total time as a regular event called 'Global'
    eventTimings["Global"] = durationMs;
    process.send({ eventTimings });
}

runMeasured();
