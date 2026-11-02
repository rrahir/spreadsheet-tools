# autoperf notes — run eval-260602

Baseline: o-spreadsheet commit `4175a73f6` (branch `autoperf/eval-260602`).
Worked 2026-06-02 → 2026-06-03. Workload = `new Model(largeDashboard)` + `leaveSession()`.
Split: `cells imported` ~ the bigger half, `evaluate all cells` the smaller; GC ~28–34% of CPU.

## What WORKED (keep / build on this)
- **Bypass per-cell command dispatch at import.** Replaced per-cell
  `dispatch("UPDATE_CELL_POSITION", …)` in `CellPlugin.import` with a direct
  `getters.setImportedCellPosition(...)` (new method on SheetPlugin delegating to
  `setNewPosition`). Import doesn't need the command pipeline (changes not recorded,
  no UI store listening yet). **cells imported −15%, Global −7%** (n=30, commit `06aa827993`).
  → Generalize this idea: other per-item work done via `dispatch` during import is
    also a candidate (but most import code already writes state directly).

## What did NOT measurably improve perf (don't retry these — all ~0.2–1%, within noise)
Kept only as harmless cleanups; none moved wall-clock:
- `deepCopy`: compute `Array.isArray` once / fewer checks.
- `computeCell`: allocate `localeFormat` only for literal/error (not formula path).
- `CompiledFormula` ctor: move token-value reset out of per-copy path.
- `unsquishFormula`: share `NO_CHANGE` ranges + drop throwaway arrays; `range()` cache
  check before intersection. (Only ~26 MB of the 700 MB — the rest is intrinsic.)
- skip `formatValue()` for empty/error evaluated cells; `RangeSet.hasPosition` no alloc.
- `BinaryGrid`: inline `getCoordinates` (drop tuple alloc).
- `addChange` index-based (no pop/at); `dispatchToHandlers` core fast-path (no per-handler instanceof).

## Key facts that make those dead ends (so we don't re-derive them)
- **`unsquishFormula` = ~35% of all allocation (~700 MB)** but it's INTRINSIC: each
  formula cell needs its own offset-shifted dependency `Range`(+zone); 2 allocs/ref is
  already minimal. Reducing it needs a **compact `Range` type** (fold zone into Range) —
  big blast radius, not attempted.
- `createEvaluatedCell` (~208 MB, one result obj/cell) and per-cell `cellPosition`
  objects (~162 MB) are intrinsic too.
- **The evaluate `while`-loop runs exactly 1 iteration** for this workload → no
  cross-iteration recompute, so caching `range()` matrices across iterations gives nothing.
- `visitMatchingRanges` (~6% CPU = SUMIF/COUNTIF) is an **excluded** specific helper.
- Making header-size (`tallestCellInRow`) lazy is NOT a real win — the UI needs it, so it
  only defers identical work to first render.

## Measurement gotchas
- Bench noise swings 0.2%–10% with machine load (chrome/vscode). For borderline (~1%)
  results, **n=10 is too noisy — use `--runs 30`** (it flipped the import change from
  "−1%, not significant" to "−7%, |Δ|/SE=16.7×").
- Allocation (heap-sampling) profiles are load-independent; use them to validate alloc cuts.
- Profiling harness used: `node --cpu-prof` and inspector `HeapProfiler.startSampling`
  over the scenario (see /tmp scripts if still present).

## Next ideas worth trying (not yet done)
1. Compact `Range`/zone representation to cut the 700 MB `unsquishFormula` allocation.
2. More import-time command bypasses (audit other plugins' `import()` for `dispatch`).
