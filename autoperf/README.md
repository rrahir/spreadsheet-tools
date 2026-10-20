# autoperf

Autonomous performance researcher for [o-spreadsheet](https://github.com/odoo/o-spreadsheet),
inspired by [autoresearch](https://github.com/karpathy/autoresearch). An AI agent iteratively edits
`src/`, builds, measures, and keeps changes that win.

## How it works

- The agent works on a dedicated branch `autoperf/<tag>` in the o-spreadsheet
  repo.
- The agent runs in a loop: find an idea → edit code → run tests → commit → benchmark → keep/discard.
- Keep/discard: prefer simpler code; reject non-significant changes; reject
  ugly micro-wins; accept zero-perf simplifications.

## Quick start

Edit `scenario.js` to define the workload, then tell the agent:
*"Read program.md and run autoperf with tag <my-tag>."*

The tag is used for the branch name.

## Files

- `autoperf` (CLI, mainly used by the agent)
- `program.md` (agent instructions)
- `scenario.js` (locked workload)
- `results.tsv` (summarized all experiments)
-  `logs/` (full benchmark logs)

Override sibling layout with `SPREADSHEET_REPO_PATH`.
