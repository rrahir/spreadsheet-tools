# Odoo Spreadsheet Benchmarking Tool

Runs a fixed workload (a "scenario") multiple times against one or more builds
of [o-spreadsheet](../../o-spreadsheet) and prints a per-event comparison.

Each run executes in a fresh child process for isolation (JIT, caching, etc.).

## Scenario format

A scenario is any ES module exporting two functions:

```js
// scenario.js
export function setup({ Model /* anything from the engine */ }, label) {
    return { data: {}, config: {}, initialMessages: [] };
}

export async function benchmark({ Model }, setupData) {
    const model = new Model(setupData.data, setupData.config, setupData.initialMessages);
    model.leaveSession();
}
```

Inside scenario or engine code you can emit per-event timings:

```js
console.debug(`evaluate all cells ${durationMs} ms`);
```

`Global` is always emitted automatically (total wall-clock of `benchmark()`).
Events whose best mean is < 5 ms are filtered out as noise.

## CLI — compare git refs

Auto-checks out each ref in the sibling `o-spreadsheet/` repo, runs `npm run
perf` to build, then benchmarks. Built bundles are cached under
`benchmark/bundles/<sha>.js`, so repeat runs against the same ref skip the
rebuild.

```sh
node --expose-gc benchmark/cli.js \
    --scenario ./my_scenario.js \
    --refs master,my-feature \
    --runs 30
```

`--runs` defaults to `20`, so it can be omitted:

```sh
node --expose-gc benchmark/cli.js --scenario ./my_scenario.js --refs master,my-feature
```

The o-spreadsheet repo is resolved as `../o-spreadsheet` relative to
`spreadsheet-tools/`. Set `SPREADSHEET_REPO_PATH` to override.

## Library — pre-built bundles or custom flows

```js
import { runBenchmark } from "./benchmark/index.js";
import { printReport } from "./benchmark/report.js";

const samples = await runBenchmark({
    targets: [
        { label: "parent",    bundlePath: "/abs/path/parent.js" },
        { label: "candidate", bundlePath: "/abs/path/candidate.js" },
        // or { label, ref } to check out + build a git ref (cached by sha)
    ],
    runsPerTarget: 15,
    scenarioPath: "/abs/path/scenario.js",
});

// samples shape: { [label]: { [event]: number[] } }
printReport(samples);
```

## Output example

```
Global
  master-better-perf:   Mean: 60.16 ms, StdErr: 1.91 ms, n=10 (vs prev: -18%)
  master:               Mean: 73.30 ms, StdErr: 1.12 ms, n=10
evaluate all cells
  master-better-perf:   Mean: 61.95 ms, StdErr: 1.38 ms, n=10 (vs prev: -23%)
  master:               Mean: 80.03 ms, StdErr: 2.32 ms, n=10
```
