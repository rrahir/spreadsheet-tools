#!/usr/bin/env node
/**
 * Standalone benchmark CLI.
 *
 *   node --expose-gc benchmark/cli.js \
 *       --scenario ./path/to/scenario.js \
 *       --refs master,my-feature \
 *       --runs 30
 *
 * Each --refs entry is a git ref that will be checked out and built in the
 * sibling o-spreadsheet repo. Built bundles are cached under benchmark/bundles/
 * by sha, so re-running with the same refs skips the rebuild. For pre-built
 * bundle workflows, use the library directly (import runBenchmark from "./index.js").
 */

import path from "path";
import { runBenchmark } from "./index.js";
import { printReport } from "./report.js";
import { parseArgs } from "./parseArgs.js";

const DEFAULT_RUNS = 20;

const args = parseArgs(process.argv.slice(2));
if (!args.scenario || !args.refs) {
    console.error("usage: node --expose-gc benchmark/cli.js --scenario <path> --refs a,b[,c...] [--runs <n>]");
    console.error(`defaults: --runs ${DEFAULT_RUNS}`);
    process.exit(2);
}

const scenarioPath = path.resolve(args.scenario);
const refs = args.refs.split(",").map((s) => s.trim()).filter(Boolean);
const runsPerTarget = args.runs ? parseInt(args.runs, 10) : DEFAULT_RUNS;

const targets = refs.map((ref) => ({ label: ref, ref }));

const samples = await runBenchmark({
    targets,
    runsPerTarget,
    scenarioPath,
    onProgress: ({ label, run, total }) => console.log(`Running ${label}, run ${run}/${total}`),
});
printReport(samples);
