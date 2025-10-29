
/**
 * Main entry point for the benchmarking framework.
 * Orchestrates the benchmarking process: switches branches, spawns worker processes,
 * collects timing data, analyzes results, and prints a formatted report.
 */

import { fork } from "child_process";
import { checkoutBranch } from "./utils.js";
import { branches, runsPerBranch } from "./benchmark_target.js";

async function runBenchmark(branch) {
    checkoutBranch(branch);
    const timings = [];
    const eventTimingsArr = [];
    for (let i = 0; i < runsPerBranch; i++) {
        const result = await runChild();
        timings.push(result.durationMs);
        eventTimingsArr.push(result.eventTimings);
    }
    return { timings, eventTimingsArr };
}

function runChild() {
    return new Promise((resolve, reject) => {
        const child = fork("./benchmark_worker.js");
        child.on("message", resolve);
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code !== 0) reject(new Error("Child exited with code " + code));
        });
    });
}

function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}


(async () => {
    const results = {};
    for (const branch of branches) {
        results[branch] = await runBenchmark(branch);
    }

    // --- Analysis function ---
    function analyzeEventTimings(results, branches) {
        // Collect all event names
        const allEvents = new Set();
        for (const branch of branches) {
            for (const eventObj of results[branch].eventTimingsArr) {
                Object.keys(eventObj).forEach(e => allEvents.add(e));
            }
        }
        const analysis = [];
        for (const event of allEvents) {
            let bestEventMean = Infinity;
            let bestEventBranch = null;
            const branchStats = [];
            // Find best mean for this event
            for (const branch of branches) {
                const arr = results[branch].eventTimingsArr.map(obj => obj[event]).filter(v => v !== undefined);
                if (arr.length === 0) continue;
                const m = mean(arr);
                if (m < bestEventMean) {
                    bestEventMean = m;
                    bestEventBranch = branch;
                }
            }
            if (bestEventMean < 5) continue; // Skip event if best mean < 5ms
            // Compute stats for each branch
            for (const branch of branches) {
                const arr = results[branch].eventTimingsArr.map(obj => obj[event]).filter(v => v !== undefined);
                if (arr.length === 0) continue;
                const m = mean(arr);
                const sd = arr.length > 1 ? stddev(arr) : 0;
                let percent = null;
                if (branch === bestEventBranch && branches.length > 1) {
                    // Find the worst mean for this event
                    const otherMeans = branches.filter(b => b !== branch).map(b => {
                        const arrOther = results[b].eventTimingsArr.map(obj => obj[event]).filter(v => v !== undefined);
                        return arrOther.length ? mean(arrOther) : null;
                    }).filter(v => v !== null);
                    if (otherMeans.length) {
                        const worstMean = Math.max(...otherMeans);
                        if (worstMean > 0) {
                            percent = ((worstMean - m) / worstMean) * 100;
                        }
                    }
                }
                branchStats.push({ branch, mean: m, stddev: sd, n: arr.length, isBest: branch === bestEventBranch, percent });
            }
            analysis.push({ event, branchStats });
        }
        return analysis;
    }

    // --- Printing function ---
    function printEventAnalysis(analysis, branches) {
        const maxBranchLen = Math.max(...branches.map(b => b.length));
        const green = "\x1b[32m";
        const reset = "\x1b[0m";
        for (const { event, branchStats } of analysis) {
            console.log(`\n${event}`);
            for (const stat of branchStats) {
                const branchLabel = `${stat.branch}:`.padEnd(maxBranchLen + 3, ' ');
                const meanStr = stat.isBest ? `${green}${stat.mean.toFixed(2)} ms${reset}` : `${stat.mean.toFixed(2)} ms`;
                let percentStr = "";
                if (stat.isBest && stat.percent !== null) {
                    percentStr = ` ${green}(-${stat.percent.toFixed(0)}%)${reset}`;
                }
                console.log(`  ${branchLabel}Mean: ${meanStr}, Stddev: ${stat.stddev.toFixed(2)} ms, n=${stat.n}${percentStr}`);
            }
        }
    }

    // Run analysis and print
    const analysis = analyzeEventTimings(results, branches);
    printEventAnalysis(analysis, branches);
})();
