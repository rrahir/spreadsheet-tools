
/**
 * Main entry point for the benchmarking framework.
 * Orchestrates the benchmarking process: switches branches, spawns worker processes,
 * collects timing data, analyzes results, and prints a formatted report.
 */


import { fork } from "child_process";
import { checkoutBranch, buildPath } from "./utils.js";
import { branches, runsPerBranch } from "./benchmark_target.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";


// Build all branches and copy their build files to temp dirs
async function buildAllBranches() {
    const tempDirs = {};
    for (const branch of branches) {
        checkoutBranch(branch);
        const buildFile = buildPath();
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `benchmark_${branch}_`));
        const destFile = path.join(tempDir, "o-spreadsheet-engine.esm.js");
        fs.copyFileSync(buildFile, destFile);
        tempDirs[branch] = { tempDir, buildFile: destFile };
        console.log(`Built and copied for branch ${branch} to ${destFile}`);
    }
    return tempDirs;
}


function runChild(workerPath, buildFilePath) {
    return new Promise((resolve, reject) => {
        const child = fork(workerPath, [], {
            env: { ...process.env, BENCHMARK_ENGINE_PATH: buildFilePath },
        });
        child.on("message", resolve);
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code !== 0) reject(new Error("Child exited with code " + code));
        });
    });
}


function getWorkerPath() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "./benchmark_worker.js");
}

function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}


function stddev(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

function stderr(arr) {
    if (arr.length <= 1) return 0;
    return stddev(arr) / Math.sqrt(arr.length);
}



export async function startBenchmarking() {
    // Step 1: Build all branches and copy build files
    const branchBuilds = await buildAllBranches();

    // Step 2: Alternate runs between branches
    const totalRuns = runsPerBranch * branches.length;
    const eventTimingsArrByBranch = {};
    for (const branch of branches) {
        eventTimingsArrByBranch[branch] = [];
    }
    const workerPath = getWorkerPath();
    for (let i = 0; i < totalRuns; i++) {
        const branch = branches[i % branches.length];
        const buildFilePath = branchBuilds[branch].buildFile;
        console.log(`Running benchmark for branch ${branch}, run ${Math.floor(i / branches.length) + 1}/${runsPerBranch}`);
        const result = await runChild(workerPath, buildFilePath);
        eventTimingsArrByBranch[branch].push(result.eventTimings);
    }

    // --- Analysis function ---
    function analyzeEventTimings(results, branches) {
        // Collect all event names
        const allEvents = new Set();
        for (const branch of branches) {
            for (const eventObj of results[branch]) {
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
                const arr = results[branch].map(obj => obj[event]).filter(v => v !== undefined);
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
                const arr = results[branch].map(obj => obj[event]).filter(v => v !== undefined);
                if (arr.length === 0) continue;
                const m = mean(arr);
                const se = arr.length > 1 ? stderr(arr) : 0;
                let percent = null;
                if (branch === bestEventBranch && branches.length > 1) {
                    // Find the worst mean for this event
                    const otherMeans = branches.filter(b => b !== branch).map(b => {
                        const arrOther = results[b].map(obj => obj[event]).filter(v => v !== undefined);
                        return arrOther.length ? mean(arrOther) : null;
                    }).filter(v => v !== null);
                    if (otherMeans.length) {
                        const worstMean = Math.max(...otherMeans);
                        if (worstMean > 0) {
                            percent = ((worstMean - m) / worstMean) * 100;
                        }
                    }
                }
                branchStats.push({ branch, mean: m, stderr: se, n: arr.length, isBest: branch === bestEventBranch, percent });
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
                console.log(`  ${branchLabel}Mean: ${meanStr}, StdErr: ${stat.stderr.toFixed(2)} ms, n=${stat.n}${percentStr}`);
            }
        }
    }

    // Run analysis and print
    const analysis = analyzeEventTimings(eventTimingsArrByBranch, branches);
    printEventAnalysis(analysis, branches);
}
