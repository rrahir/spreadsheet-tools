/**
 * Programmatic benchmark library.
 *
 * runBenchmark({ targets, runsPerTarget, scenarioPath, onProgress? })
 *   targets:        Array of { label, ref }
 *                   ref is any git ref (branch, sha, "HEAD", …) in the
 *                   o-spreadsheet repo.
 *   runsPerTarget:  positive integer; total runs = runsPerTarget * targets.length.
 *   scenarioPath:   absolute path to a module exporting `setup` and `benchmark`.
 *   onProgress:     optional ({ label, run, total }) => void.
 *   buildOut:       optional writable stream — build/checkout output is
 *                   written there.
 *
 * Returns: { [label]: { [eventName]: number[] } } — raw samples, no analysis.
 */

import { fork, execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getOdooSpreadsheetRepoPath, buildPath, resolveSha, getCurrentRef } from "./repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(__dirname, "./worker.js");

const DEFAULT_CACHE_DIR = path.resolve(__dirname, "bundles");

function runInRepo(cmd, out) {
    const cwd = getOdooSpreadsheetRepoPath();
    if (!out) {
        execSync(cmd, { cwd, stdio: "inherit" });
        return;
    }
    const r = spawnSync(cmd, { cwd, shell: true });
    if (r.stdout?.length) out.write(r.stdout);
    if (r.stderr?.length) out.write(r.stderr);
    if (r.status !== 0) throw new Error(`${cmd} failed with status ${r.status}`);
}

function cachePath(sha, cacheDir) {
    return path.join(cacheDir, `${sha}.js`);
}

export function buildAndCacheBundle({ ref = "HEAD", cacheDir = DEFAULT_CACHE_DIR, out } = {}) {
    const sha = resolveSha(ref);
    const bundlePath = cachePath(sha, cacheDir);
    if (fs.existsSync(bundlePath)) {
        out?.write(`Using cached bundle for ${ref} (${sha})\n`);
        return { sha, bundlePath };
    }

    const headSha = resolveSha("HEAD");
    if (headSha !== sha) {
        runInRepo(`git checkout ${ref}`, out);
    }
    runInRepo("npm run perf", out);

    fs.mkdirSync(cacheDir, { recursive: true });
    const tmp = path.join(cacheDir, `.${sha}.tmp.js`);
    fs.copyFileSync(buildPath(), tmp);
    fs.renameSync(tmp, bundlePath);
    return { sha, bundlePath };
}

function runOnce(bundlePath, scenarioPath, label) {
    return new Promise((resolve, reject) => {
        const child = fork(WORKER_PATH, [], {
            execArgv: ["--expose-gc"],
            env: {
                ...process.env,
                BENCHMARK_ENGINE_PATH: bundlePath,
                BENCHMARK_SCENARIO: scenarioPath,
                BENCHMARK_LABEL: label,
            },
        });
        let received = null;
        child.on("message", (msg) => { received = msg; });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code !== 0) reject(new Error(`worker exited with code ${code}`));
            else if (!received) reject(new Error("worker exited without sending result"));
            else resolve(received);
        });
    });
}

export async function runBenchmark({ targets, runsPerTarget, scenarioPath, onProgress, buildOut }) {
    if (!Array.isArray(targets) || targets.length === 0) throw new Error("targets required");
    if (!Number.isInteger(runsPerTarget) || runsPerTarget < 1) throw new Error("runsPerTarget must be a positive integer");
    if (!scenarioPath) throw new Error("scenarioPath required");

    const bundles = {};
    // Building a target may `git checkout` a different ref in the o-spreadsheet
    // repo. Remember where it started so we can restore it afterwards.
    const originalRef = getCurrentRef();
    try {
        for (const t of targets) {
            if (!t.ref) throw new Error(`target ${JSON.stringify(t)} must have a ref`);
            bundles[t.label] = buildAndCacheBundle({ ref: t.ref, out: buildOut }).bundlePath;
        }
    } finally {
        if (resolveSha(originalRef) !== resolveSha("HEAD")) {
            runInRepo(`git checkout ${originalRef}`, buildOut);
        }
    }
    const labels = targets.map((t) => t.label);

    const samples = {};
    for (const label of labels) samples[label] = {};

    const total = runsPerTarget * labels.length;
    for (let i = 0; i < total; i++) {
        const label = labels[i % labels.length];
        onProgress?.({ label, run: Math.floor(i / labels.length) + 1, total: runsPerTarget });
        const { eventTimings } = await runOnce(bundles[label], scenarioPath, label);
        for (const [event, ms] of Object.entries(eventTimings)) {
            (samples[label][event] ||= []).push(ms);
        }
    }
    return samples;
}
