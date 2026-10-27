#!/usr/bin/env node
/**
 * Runs every scenario of this folder.
 *
 * Smoke run against one pre-built bundle: checks that scenarios still work
 * and stay within their time budget.
 *
 *   node benchmark/scenarios/run_all.js \
 *       [--bundle ../o-spreadsheet/dist/o_spreadsheet.esm.js] \
 *       [--runs 3] [--filter eval_] [--budget 2000]
 *
 * Branch comparison: builds the needed commits of the o-spreadsheet repo
 * (cached by sha, see benchmark/index.js) and compares them on every scenario.
 *
 *   node benchmark/scenarios/run_all.js --branch <ref> \
 *       [--compare base|commits] [--base <branch>] [--runs 10] [--filter eval_] [--events]
 *
 *   --compare base     (default) the branch head vs the base of the branch
 *   --compare commits  every commit of the branch, from its base onward,
 *                      each one compared to the previous one
 *   --base             branch the branch was forked from. Inferred from the
 *                      branch name otherwise ("18.0-my-fix-abc" -> "18.0").
 *                      The base commit is the merge-base with that branch.
 *   --events           also print the detailed report of every event
 *   --repo             path of the o-spreadsheet repo (default: the
 *                      SPREADSHEET_REPO_PATH env variable, or ../o-spreadsheet)
 *
 * Runs alternate between the builds (A B B A A B ...) so that any drift
 * during the session (thermal throttling, background load) affects all of
 * them equally.
 *
 * To compare arbitrary git refs on a single scenario, use benchmark/cli.js.
 */

import { execFileSync, fork } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildAndCacheBundle } from "../index.js";
import { parseArgs } from "../parseArgs.js";
import { analyze, printReport } from "../report.js";
import { buildPath, getCurrentRef, getOdooSpreadsheetRepoPath, resolveSha } from "../repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(__dirname, "../worker.js");
const BUNDLE_CACHE_DIR = path.resolve(__dirname, "../bundles");

const args = parseArgs(process.argv.slice(2));
if (args.repo) {
    // read by repo.js, used by the build helpers of benchmark/index.js
    process.env.SPREADSHEET_REPO_PATH = path.resolve(args.repo);
}
const branchMode = Boolean(args.branch);
const runs = args.runs ? parseInt(args.runs, 10) : branchMode ? 10 : 3;
const budget = args.budget ? parseFloat(args.budget) : 2000;

const scenarios = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith(".js") && f !== "run_all.js")
    .filter((f) => !args.filter || f.includes(args.filter))
    .sort();

function runOnce(bundlePath, scenarioPath) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        const child = fork(WORKER_PATH, [], {
            execArgv: ["--expose-gc"],
            env: {
                ...process.env,
                BENCHMARK_ENGINE_PATH: bundlePath,
                BENCHMARK_SCENARIO: scenarioPath,
                BENCHMARK_LABEL: "run_all",
            },
        });
        let received = null;
        child.on("message", (msg) => { received = msg; });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code !== 0 || !received) reject(new Error(`worker exited with code ${code}`));
            else resolve({ ...received, wallMs: performance.now() - start });
        });
    });
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const relStdDev = (values) => {
    const m = mean(values);
    return values.length > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1)) / m : 0;
};
const fmtMs = (values) => `${mean(values).toFixed(0).padStart(5)} ms ±${(relStdDev(values) * 100).toFixed(1).padStart(4)}%`;

// ---------------------------------------------------------------------------
// Smoke run on a single bundle
// ---------------------------------------------------------------------------

async function smokeRun() {
    const bundlePath = path.resolve(args.bundle || buildPath());
    if (!fs.existsSync(bundlePath)) {
        console.error(`Bundle not found: ${bundlePath} (build it with \`npm run perf\` or pass --bundle)`);
        process.exit(2);
    }
    let failures = 0;
    for (const file of scenarios) {
        const samples = [];
        try {
            for (let i = 0; i < runs; i++) samples.push(await runOnce(bundlePath, path.join(__dirname, file)));
        } catch (e) {
            failures++;
            console.log(`✗ ${file.padEnd(42)} ERROR ${e.message}`);
            continue;
        }
        const globals = samples.map((s) => s.eventTimings.Global);
        const max = Math.max(...globals);
        const overBudget = max > budget;
        if (overBudget) failures++;
        const events = {};
        for (const s of samples) {
            for (const [event, ms] of Object.entries(s.eventTimings)) (events[event] ||= []).push(ms);
        }
        const details = Object.entries(events)
            .filter(([event, values]) => event !== "Global" && mean(values) >= 5)
            .sort((a, b) => mean(b[1]) - mean(a[1]))
            .slice(0, 4)
            .map(([event, values]) => `${event}=${mean(values).toFixed(0)}`)
            .join(", ");
        console.log(
            `${overBudget ? "✗" : "✓"} ${file.padEnd(42)} ${fmtMs(globals)} ` +
                `(max ${max.toFixed(0)}, process ${mean(samples.map((s) => s.wallMs)).toFixed(0)} ms)  ${details}`
        );
    }
    return failures;
}

// ---------------------------------------------------------------------------
// Branch comparison
// ---------------------------------------------------------------------------

function git(...gitArgs) {
    return execFileSync("git", gitArgs, {
        cwd: getOdooSpreadsheetRepoPath(),
        stdio: ["ignore", "pipe", "pipe"],
    }).toString().trim();
}

function refExists(ref) {
    try {
        git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
        return true;
    } catch {
        return false;
    }
}

/** Odoo branch naming: "<base>-<description>", e.g. "18.0-fix-xyz", "saas-18.2-imp", "master-ref" */
function inferBaseBranch(branch) {
    const name = branch.replace(/^origin\//, "");
    const match = name.match(/^(master|saas-\d+\.\d+|\d+\.\d+)-/);
    if (!match) {
        throw new Error(`Cannot infer the base branch of "${branch}", pass it with --base`);
    }
    return match[1];
}

/** Prefers the remote branch, which is usually more up to date than the local one */
function resolveBaseRef(base) {
    for (const ref of [`origin/${base}`, base]) {
        if (refExists(ref)) return ref;
    }
    throw new Error(`Base branch "${base}" not found`);
}

function describeCommit(sha) {
    return git("log", "-1", "--format=%s", sha);
}

function checkRepo() {
    const repoPath = getOdooSpreadsheetRepoPath();
    try {
        execFileSync("git", ["rev-parse", "--git-dir"], { cwd: repoPath, stdio: "ignore" });
    } catch {
        throw new Error(
            `No o-spreadsheet git repo at ${repoPath}. Pass --repo <path> or set SPREADSHEET_REPO_PATH.`
        );
    }
    return repoPath;
}

function getTargets(branch, compare) {
    console.log(`Repo ${checkRepo()}`);
    if (!refExists(branch)) throw new Error(`Branch "${branch}" not found in ${getOdooSpreadsheetRepoPath()}`);
    const baseRef = resolveBaseRef(args.base || inferBaseBranch(branch));
    const head = git("rev-parse", branch);
    const base = git("merge-base", head, baseRef);
    if (base === head) throw new Error(`"${branch}" has no commit on top of ${baseRef}`);
    let shas;
    if (compare === "base") {
        shas = [base, head];
    } else if (compare === "commits") {
        shas = [base, ...git("rev-list", "--reverse", "--first-parent", `${base}..${head}`).split("\n")];
    } else {
        throw new Error(`Unknown --compare "${compare}", expected "base" or "commits"`);
    }
    console.log(`Branch ${branch}, base ${baseRef} (merge-base ${base.slice(0, 10)})`);
    return shas.map((sha, i) => ({
        sha,
        label: resolveSha(sha), // also the name of the cached bundle
        role: i === 0 ? "base" : compare === "base" ? "head" : `${i}/${shas.length - 1}`,
        subject: describeCommit(sha),
    }));
}

function buildTargets(targets) {
    const missing = targets.filter((t) => !fs.existsSync(path.join(BUNDLE_CACHE_DIR, `${t.label}.js`)));
    if (missing.length && git("status", "--porcelain", "--untracked-files=no")) {
        throw new Error(`${getOdooSpreadsheetRepoPath()} has uncommitted changes, which would prevent checking out the commits to build`);
    }
    const originalRef = getCurrentRef();
    // Without a listener, Ctrl-C would kill this process before the repo is
    // checked out back. With one, only the build process is interrupted and
    // its failure unwinds through the `finally` below.
    const onSignal = () => {};
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    try {
        for (const target of targets) {
            target.bundlePath = buildAndCacheBundle({ ref: target.sha, out: process.stderr }).bundlePath;
        }
    } finally {
        if (getCurrentRef() !== originalRef) {
            console.error(`Checking out ${originalRef} back`);
            git("checkout", originalRef);
        }
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
    }
}

function pctChange(previous, current) {
    const pct = ((current - previous) / previous) * 100;
    return `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}%`;
}

function formatVerdict(stat, previous) {
    if (!stat.verdict) return "";
    const ratio = Number.isFinite(stat.verdict.ratio) ? Math.abs(stat.verdict.ratio).toFixed(1) : "∞";
    return `${stat.verdict.label} ${pctChange(previous.mean, stat.mean).padStart(7)} (|Δ|/SE ${ratio})`;
}

async function branchRun() {
    const compare = args.compare || "base";
    const targets = getTargets(args.branch, compare);
    for (const t of targets) console.log(`  ${t.role.padEnd(6)} ${t.label} ${t.subject}`);
    buildTargets(targets);
    console.log(`\n${scenarios.length} scenarios x ${targets.length} builds x ${runs} runs, alternating builds\n`);

    const significant = []; // { target, file, text }
    let failures = 0;
    for (const file of scenarios) {
        const scenarioPath = path.join(__dirname, file);
        const samples = Object.fromEntries(targets.map((t) => [t.label, {}]));
        let error;
        for (let i = 0; i < runs && !error; i++) {
            const order = i % 2 ? [...targets].reverse() : targets;
            for (const target of order) {
                try {
                    const { eventTimings } = await runOnce(target.bundlePath, scenarioPath);
                    for (const [event, ms] of Object.entries(eventTimings)) (samples[target.label][event] ||= []).push(ms);
                } catch (e) {
                    error = `${target.label}: ${e.message}`;
                    break;
                }
            }
        }
        if (error) {
            failures++;
            console.log(`✗ ${file.padEnd(42)} ERROR ${error}`);
            continue;
        }
        const global = analyze(samples).find((entry) => entry.event === "Global");
        const stats = global.labelStats;
        const line = (target, i) => {
            const verdict = i > 0 ? formatVerdict(stats[i], stats[i - 1]) : "";
            if (stats[i].verdict && stats[i].verdict.label !== "⚫") {
                significant.push({ target, file, text: verdict });
            }
            return `${target.role.padEnd(6)} ${target.label} ${fmtMs(samples[target.label].Global)}  ${verdict}`;
        };
        if (compare === "base") {
            console.log(`  ${file.padEnd(42)} ${line(targets[0], 0)}`);
            console.log(`  ${"".padEnd(42)} ${line(targets[1], 1)}`);
        } else {
            console.log(`  ${file}`);
            targets.forEach((target, i) => console.log(`      ${line(target, i)}`));
        }
        if (args.events) printReport(samples, { eventFilter: (entry) => entry.event !== "Global" });
    }

    console.log(`\nSignificant changes (|Δ|/SE >= 2, ${compare === "base" ? "head vs base" : "each commit vs the previous one"}):`);
    for (const target of targets.slice(1)) {
        const changes = significant.filter((s) => s.target === target);
        if (compare === "commits") console.log(`  ${target.role} ${target.label} ${target.subject}`);
        if (!changes.length) console.log(`      none`);
        for (const { file, text } of changes) console.log(`      ${file.padEnd(42)} ${text}`);
    }
    return failures;
}

let failures;
try {
    failures = branchMode ? await branchRun() : await smokeRun();
} catch (e) {
    console.error(e.message);
    process.exit(2);
}
process.exit(failures ? 1 : 0);
