import { execSync, fork } from "child_process";
import fs from "fs";
import v8 from "v8";
import path from "path";
import { mean, stddev, confidenceInterval } from "./bench_utils.js";

function saveHeapSnapshot(runNumber) {
    GC();
    // Disabled for now, uncomment to enable heap snapshots
    // const snapshotsDir = path.resolve("snapshots");
    // if (!fs.existsSync(snapshotsDir)) {
    //     fs.mkdirSync(snapshotsDir);
    // }
    // const ts = new Date().toISOString().replace(/[:.]/g, "-");
    // const filename = path.join(snapshotsDir, `heap-${ts}-run${runNumber}.heapsnapshot`);
    // v8.writeHeapSnapshot(filename);
    // console.log(`Heap snapshot saved: ${filename}`);
}

function GC() {
    if (global.gc) {
        global.gc();
    }
}

export function checkoutBranch(branch) {
    const oSpreadsheetPath = getOdooSpreadsheetRepoPath();
    execSync(`git checkout ${branch}`, { stdio: "inherit", cwd: oSpreadsheetPath });
    execSync("npm run build", { stdio: "inherit", cwd: oSpreadsheetPath });
    execSync("npm run bundle:esm --workspaces", { stdio: "inherit", cwd: oSpreadsheetPath });
}

export function buildPath() {
    return path.join(getOdooSpreadsheetRepoPath(), "packages", "o-spreadsheet-engine", "build", "o-spreadsheet-engine.esm.js");
}

function getOdooSpreadsheetRepoPath() {
    const configPath = `${process.env.HOME}/.spConfig.ini`;
    const iniContent = fs.readFileSync(configPath, "utf-8");
    let repoPath = null;
    const spreadsheetSection = iniContent.match(/\[spreadsheet\]([\s\S]*?)(\n\[|$)/);
    if (spreadsheetSection) {
        const lines = spreadsheetSection[1].split(/\r?\n/);
        for (const line of lines) {
            const m = line.match(/repo_path\s*=\s*(.*)/);
            if (m) {
                repoPath = m[1].trim();
                break;
            }
        }
    }
    if (!repoPath) {
        throw new Error("Could not find repo_path in [spreadsheet] section of config");
    }
    return repoPath;
}

// function printBenchmarkResults(branchA, meanA, ciA, branchB, meanB, ciB) {
//     console.log("--- Benchmark Results ---");
//     console.log(
//         `Branch ${branchA}: mean = ${meanA.toFixed(3)} ms, 95% CI = [${ciA[0].toFixed(3)}, ${ciA[1].toFixed(3)}] ms`
//     );
//     console.log(
//         `Branch ${branchB}: mean = ${meanB.toFixed(3)} ms, 95% CI = [${ciB[0].toFixed(3)}, ${ciB[1].toFixed(3)}] ms`
//     );
//     const diff = meanB - meanA;
//     const percent = (diff / meanA) * 100;
//     if (Math.abs(diff) < 1e-6) {
//         console.log("No significant difference between branches.");
//     } else if (diff < 0) {
//         console.log(
//             `Branch ${branchB} is faster by ${Math.abs(diff).toFixed(3)} ms (${Math.abs(percent).toFixed(2)}%) compared to ${branchA}.`
//         );
//     } else {
//         console.log(
//             `Branch ${branchB} is slower by ${diff.toFixed(3)} ms (${percent.toFixed(2)}%) compared to ${branchA}.`
//         );
//     }
// }

// // Example usage:
// function setup() {
//     return makeLargeDataset(26, 5000, ["formulas"]);
// }

// function targetFunction(Model, setupData) {
//     const model = new Model(setupData);
//     model.leaveSession();
// }

// // Uncomment and set branch names to use:
// benchmarkOnBranches({
//     fn: targetFunction,
//     branchA: "master-style-circular-dependency-lul",
//     branchB: "master-before-perf-imp-lul",
//     iterations: 50,
//     warmup: 3,
//     setup,
// });
