# autoperf — autonomous performance researcher for o-spreadsheet

Your job: make a fixed benchmark scenario run faster by iteratively modifying
o-spreadsheet source, measuring, and keeping changes that win.

## Repo layout (sibling dirs)

```
<spreadsheet-tools>/
  autoperf/        ← this directory. cd here once and stay.
  benchmark/       ← benchmark library (do not edit).
<o-spreadsheet>/   ← codebase you edit. Run branch: autoperf/<tag>.
```

## Setup (once per run)

1. `cd` to the autoperf directory.
2. `./autoperf init <tag>` — creates branch `autoperf/<tag>` off current
   o-spreadsheet HEAD. Prints the absolute path of the o-spreadsheet repo.
   Read it once; use it as a prefix when editing files.
3. **Ask the user where to focus** — exactly once, before any hypothesis,
   *unless the user already specified a focus in their initial request* (then skip
   the pause and use it). This is the one allowed pause (see
   [Never stop after setup](#never-stop-after-setup)).
   Ask which part of the workload (e.g. cell evaluation, import, a specific
   code path) they're trying to optimize.
4. **Profile before hypothesizing** (see [Profiling](#profiling)). Don't guess at
   hot paths — measure them, and re-profile a kept commit before picking the next target.

## What you can modify

- Anywhere under `<o-spreadsheet>/src/`.
- `<o-spreadsheet>/tests/` only when a kept change legitimately invalidates an
  implementation-detail test; note it in the commit message.

You may **not** modify: `package.json`, build configs, lockfiles, anything in
`spreadsheet-tools/`, git config or `scenario.js` (the locked workload).

## The loop

Four verbs: `commit`, `bench`, `keep`, `discard`.

```
LOOP FOREVER:
  1. Form a hypothesis. Focus on algorithms, data structures, memory allocation.
     Edit files under <o-spreadsheet>/src/.
  2. Run tests: ./autoperf jest <pattern>
       - test asserts broken behavior → fix or revert, try again.
       - test asserts an implementation detail you legitimately changed →
         update it; note in commit message.
  3. ./autoperf commit "describe the change"      # prints new short SHA
  4. ./autoperf bench    # SLOW: can be ~30s per run-pair, tens of minutes total.
       # Run it in the BACKGROUND and do read-only analysis while it runs.
       # Do NOT edit source or run HEAD-relative git while a bench runs (see Pitfalls).
       # stdout has:
       #   - a header line: `commit=<sha> parent=<sha>`
       #   - one block per reported event.
       #     Events shown: `Global` always, plus any sub-event whose
       #     verdict is `faster`. Slower / unchanged sub-events are in the
       #     log only.
       #   - a `log=<path>` line.
       # If stdout starts with `crash:` → treat as discard.
  5. Decide keep vs discard (rules below).
  6. Append row to results.tsv (TAB-separated, do not commit it):
       commit  global_ms  stderr_ms  speedup_pct  status  description
       status ∈ {baseline, keep, discard, crash}.
       description should name the targeted sub-event when relevant.
       Example row (tabs shown as ⇥):
         a1b2c3d⇥412.30⇥3.10⇥-4.2⇥keep⇥hoist regex compile out of evaluate-cells loop
  7. keep → ./autoperf keep "<note>"   # amends HEAD with the bench measures and a note.
     The note should mention why you keep the change.
     discard / crash → ./autoperf discard   # git reset --hard HEAD~1
  8. Repeat.
```

## Decision rules

Decisions are made vs the immediate parent commit (your first experiment's
parent is the `init` HEAD — that is the implicit baseline; there is no separate
baseline bench).

The verdict label is one of `faster` (🟢), `slower` (🔴), or `no measurable change` (⚫)
(|Δ|/SE < 2). Read the verdict on `Global` for the overall keep/discard
call; read it on your focus sub-event when chasing a targeted speedup.

- **Verdict `faster` on Global (or on the focus sub-event, with Global not `slower`)** → **keep**.
- **Verdict `no measurable change`** → **discard**. Don't keep neutral "cleanups"
- **Borderline verdict (|Δ|/SE roughly 1–3) on a change you have a structural reason
  to expect helps** → this is a concrete reason to re-bench at higher `--runs`
  (e.g. `./autoperf bench --runs 30`) *before* deciding. A single low-n bench can be
  badly unlucky — see Pitfalls. Decide keep/discard on the higher-n result.
- **Verdict `slower` on Global** → **discard**.
- **Tiny speedup buried in complex code** → **discard**. A 1–2% win is not worth
  it unless it's extremely trivial. A 1–2% win from deleting a line is a great keep.
- **Crash / unfixable test failure** → **discard** (status `crash`).

## Sub-event timings

The benchmark reports several statistics.
`Global` is the total wall-clock of `benchmark()` and is what the `Global:`
line on bench stdout reports. The benchmark log also reports **per-event
statistics** for any event emitted via `console.debug("<EventName> <number>
ms")` during the run.
Each event block in the log looks like:

```
evaluate all cells
  parent:     Mean: 3046.29 ms, StdErr: 18.22 ms
  candidate:  Mean: 1746.16 ms, StdErr: 11.80 ms → 🟢 (vs prev: -43%, Δ=-1300.13 ms, combined StdErr=21.71 ms, |Δ|/SE=-59.9x; n=20)

Legend:
  ⚫: no measurable change |Δ|/SE < 2
  🔴: slower Δ > 0 and |Δ|/SE >= 2
  🟢: faster Δ < 0 and |Δ|/SE >= 2
```
Interesting events are mainly "evaluate all cells", "cells imported", "Model created"

To list event names + means quickly from a bench log:
```
grep -B1 -A1 '^  parent:' "$log"
```

How to use this:

- **Optimize for a sub-event.** It's legitimate to chase a regression or win
  on a specific sub-event (e.g. `evaluate all cells`) as long as `Global`
  never regresses. Note in your `results.tsv` description which sub-event you
  targeted.

## Profiling

Profile *before* hypothesizing, and re-profile a kept commit before the next target.
The bench tells you *whether* you won; a profile tells you *where* to look.

Two built-in commands, both for the current ref by default. Each prints a
ranked table and saves the raw profile under `logs/` (`.cpuprofile` / `.heapprofile`),
printing a `profile=<path>` line.

- **`./autoperf profile [--ref <ref>] [--runs <N>]`** — CPU self-time.
  Finds hot functions. Note GC can be a large, *load-sensitive* share here, so CPU
  self-time alone can mislead under machine load.
- **`./autoperf profile-memory [--ref <ref>] [--runs <N>]`** — allocation by `selfSize`
  via heap sampling. **Load-independent** (counts bytes, not time) —
  the reliable signal when wall-clock is noisy, and the right tool when GC dominates.

Use `profile-memory` to *validate* that an allocation cut actually landed (and by how
much) even when the bench verdict is within noise: profile the parent and the candidate,
compare the targeted function's MB. If allocation didn't drop, the change isn't doing
what you think.

## Pitfalls

- **A bench temporarily checks out the parent commit.** `bench` runs
  `git checkout HEAD~1` to build the parent bundle, then checks back. **While a
  bench runs, HEAD points at the parent.** So:
  - Do **not** edit source during a bench (it dirties the tree and fights the checkout).
  - Do **not** trust `git show HEAD:<file>` or other HEAD-relative git during a bench —
    it shows the *parent's* code, which looks (falsely) like your commit didn't land.
    Inspect explicit SHAs instead: `git show <sha>:<file>`. (Stale "file was modified"
    snapshots from the harness during a bench have the same cause.)
  - Serialize strictly: edit → `jest` → `commit` → `bench` (wait for it) → `keep`/`discard`.
- **A single low-n bench can be badly unlucky — StdErr from one run understates this.**
  Observed: a change read `−1%, |Δ|/SE 1.0×` (not significant) at n=10, then `−7%,
  |Δ|/SE 16.7×` at n=30 for *identical code* — the n=10 sample mis-measured the same
  commit by ~430 ms. So "trust the StdErr" is not enough at low n. For borderline
  verdicts (|Δ|/SE ~1–3), re-run with `--runs 30`. Otherwise, don't rerun without a
  concrete reason.
- **Don't cheat the measurement.** No label sniffing, no global caches, no
  no-oping work the scenario needs. If a speedup seems too good, it is.
- **Don't run raw git for state changes** — use `./autoperf commit` /
  `./autoperf keep` / `./autoperf discard`. Read-only inspection (`git log`,
  `git diff`, `git show`, `git status`) is fine — except against a running bench
  (see above).

## Never stop after setup

The setup focus question (Setup step 3) is the only allowed pause. Once the
loop is running, do not pause to ask "should I continue?" — the user may be
asleep. Keep going until manually interrupted. If you run out of ideas,
profile a kept commit, re-read the hot path, combine near-misses, or try a
more radical refactor.
If something goes wrong for an unexpected reason and you can't fix it in 2-3
attempts, stop and ask for help.

## Files

```
autoperf              — the Node CLI (init / commit / bench / profile / profile-memory / keep / discard / jest)
program.md            — this file
README.md             — human overview
scenario.js           — LOCKED workload (do not edit during a run)
results.tsv           — experiment log (gitignored)
logs/                 — full bench report per run, plus raw .cpuprofile/.heapprofile (gitignored)
```
