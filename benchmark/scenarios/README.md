# Benchmark scenarios

A catalog of performance scenarios for o-spreadsheet, to be run with the
[benchmark tool](../README.md). Each scenario simulates something a user
actually does, focuses on one area of the engine, and runs in well under 2s
per run on the current engine, so that a significant regression or
improvement shows up clearly.

## Running

Compare git refs on one scenario (the usual workflow):

```sh
node --expose-gc benchmark/cli.js \
    --scenario benchmark/scenarios/eval_lookup_functions.js \
    --refs master,my-feature
```

Smoke-run every scenario against an already built bundle, to check that they
all work and stay within budget:

```sh
node benchmark/scenarios/run_all.js --bundle ../o-spreadsheet/dist/o_spreadsheet.esm.js --runs 3
node benchmark/scenarios/run_all.js --filter feature_     # only some scenarios
```

Compare a branch on every scenario. The commits are built and cached like
with `cli.js` (the repo must have no uncommitted changes when something needs
to be built, and is checked out back to its original ref afterwards):

```sh
# branch head vs the base of the branch (default)
node benchmark/scenarios/run_all.js --branch 18.0-my-fix-abc --compare base
# every commit of the branch, from its base onward, each vs the previous one
node benchmark/scenarios/run_all.js --branch 18.0-my-fix-abc --compare commits
```

- The base commit is the merge-base with the base branch, inferred from the
  branch name (`18.0-…` → `18.0`, `saas-18.2-…` → `saas-18.2`,
  `master-…` → `master`; `origin/<base>` is preferred over the local branch).
  Use `--base <branch>` otherwise.
- Runs alternate between the builds (A B B A A B …) so that drift during the
  session affects every build equally. `--runs` defaults to 10 in this mode.
- Each scenario prints the mean `Global` time per build and a verdict versus
  the previous build (🔴 slower / 🟢 faster when |Δ|/SE ≥ 2, ⚫ otherwise),
  followed by a summary of significant changes per commit. `--events` also
  prints the detailed report of every sub-event.
- The repo is expected at `../o-spreadsheet`; otherwise pass `--repo <path>`
  (or set `SPREADSHEET_REPO_PATH`).

## Conventions

- **What is measured.** `setup()` is not measured. Scenarios about opening a
  file build the data in `setup()` and measure `new Model(data)`. Scenarios
  about an interaction build the model in `setup()` and only measure the
  interaction.
- **Deterministic data.** Data comes from a seeded PRNG (`lib/data.js`), so
  every run and every ref works on the same workbook.
- **Version independent data.** Raw data is written in a simple, old format
  and normalized with `toCurrentData()` (load + export in a throw-away model)
  so the measured region never pays for migrations.
- **Sub-events.** Besides `Global`, scenarios emit events for their phases
  with `measure("phase name", fn)` (see `lib/helpers.js`), and the engine
  emits its own (`evaluate all cells`, `cells imported in`, commands taking
  more than 5ms...). Event names may only contain letters, digits, spaces and
  dots.
- **Reading results.** After an edit, scenarios read what the grid would
  display (`readViewport`), so that lazy computations are included.
  Rendering itself is only measured by `render_*` scenarios.
- **UI stores.** Some features live in UI stores rather than in the model
  (autofill, grid rendering). They are instantiated headlessly
  (`attachStores`, `lib/render.js`).

## Catalog

Times are the mean `Global` duration of 5 runs on an Apple Silicon laptop
(Node 24), for the engine at the time of writing.

| Scenario | Simulates | Stresses | Time |
| --- | --- | --- | --- |
| [`load_large_values`](load_large_values.js) | Open a 40k rows export of plain values | Cell import, literal parsing | 881 ms |
| [`load_formula_dependency_chains`](load_formula_dependency_chains.js) | Open a 15k rows bank ledger with running balances | Deep dependency chains (graph build, evaluation order) | 324 ms |
| [`load_styled_workbook`](load_styled_workbook.js) | Open a 10k rows report formatted like an Excel import | Style / format / border import, fragmented style zones | 309 ms |
| [`load_many_sheets`](load_many_sheets.js) | Open a consolidation of 60 branch sheets + summary | Per-sheet overhead, cross-sheet references | 369 ms |
| [`load_collaborative_history`](load_collaborative_history.js) | Open a shared file with 1000 revisions since the last snapshot | Revision replay | 1223 ms |
| [`eval_lookup_functions`](eval_lookup_functions.js) | Enrich 10k order ids from a 10k rows table | VLOOKUP / INDEX-MATCH / XLOOKUP, exact and sorted | 448 ms |
| [`eval_conditional_aggregation`](eval_conditional_aggregation.js) | Sales dashboard over 20k rows | SUMIFS / COUNTIFS / AVERAGEIFS criteria matching | 995 ms |
| [`eval_full_column_references`](eval_full_column_references.js) | Dashboard using `A:A` references on a 50k rows sheet | Full-column / unbounded ranges | 555 ms |
| [`eval_dynamic_arrays`](eval_dynamic_arrays.js) | Analysis with UNIQUE / FILTER / SORT / SEQUENCE | Array formulas, spilling, dependencies on spills | 678 ms |
| [`eval_text_functions`](eval_text_functions.js) | Clean up an 8k rows contact list | String functions | 341 ms |
| [`eval_date_functions`](eval_date_functions.js) | Derive calendar data from 8k order dates | Date functions, working days, date formatting | 431 ms |
| [`eval_financial_functions`](eval_financial_functions.js) | Loan portfolio of 6000 loans | PMT family, NPV, iterative IRR / RATE | 410 ms |
| [`eval_statistical_functions`](eval_statistical_functions.js) | Rank 1200 orders among all orders | RANK / MEDIAN / PERCENTILE..., quadratic per-row scans | 695 ms |
| [`eval_unique_formula_compilation`](eval_unique_formula_compilation.js) | Open a hand-written model of 15k unique formulas | Tokenizer, parser, compiler (defeats the compilation cache) | 445 ms |
| [`eval_wide_row_dependencies`](eval_wide_row_dependencies.js) | Open a daily plan of 1800 day columns x 80 rows, edit 5 early inputs | Dependencies along rows: horizontal chains, row ranges | 1130 ms |
| [`edit_incremental_recalc`](edit_incremental_recalc.js) | Correct 15 quantities feeding a SUMIFS dashboard | Incremental evaluation through large range dependencies | 904 ms |
| [`edit_what_if_assumptions`](edit_what_if_assumptions.js) | Tweak 15 times the assumptions of a 4k scenarios model | Incremental evaluation, high fan-out through single cells | 430 ms |
| [`edit_sequential_typing`](edit_sequential_typing.js) | Type 300 values in a 30k rows sheet | Fixed per-command cost on a large workbook | 1033 ms |
| [`edit_undo_redo`](edit_undo_redo.js) | 36 mixed edits, undo all, redo all | Local history | 1048 ms |
| [`edit_autofill`](edit_autofill.js) | Drag 5 formulas and a series down 10k rows | Autofill rules, creation of many formulas | 1524 ms |
| [`edit_find_replace`](edit_find_replace.js) | Search & replace in a 30k rows sheet | Full-sheet text scan, mass replacement | 163 ms |
| [`edit_formatting`](edit_formatting.js) | Format a raw 20k rows export | Formatting commands on large zones | 1456 ms |
| [`struct_insert_delete_rows`](struct_insert_delete_rows.js) | Insert / delete rows and columns in a referenced table | Reference / range adaptation (formulas, CF, DV, charts) | 1473 ms |
| [`struct_sort`](struct_sort.js) | Sort a 7k rows table three times | Sort, cell relocation | 1269 ms |
| [`struct_hide_and_group`](struct_hide_and_group.js) | Group 40k rows by month, fold, hide, unhide | Header visibility, header positions | 368 ms |
| [`struct_sheet_duplicate`](struct_sheet_duplicate.js) | Duplicate a 12k rows formatted sheet 3 times | Sheet duplication of all plugins' data | 1198 ms |
| [`struct_sheet_rename`](struct_sheet_rename.js) | Rename a sheet referenced by 24k formulas | Formula rewriting on rename | 287 ms |
| [`feature_conditional_formatting`](feature_conditional_formatting.js) | Scroll and edit a 20k rows sheet with 6 CF rules | CF evaluation and invalidation | 1276 ms |
| [`feature_data_validation`](feature_data_validation.js) | Look for invalid cells and fix them in a 15k rows sheet | Data validation evaluation | 388 ms |
| [`feature_table_filters`](feature_table_filters.js) | Filter a 20k rows table with SUBTOTAL totals | Filters, hidden rows, SUBTOTAL | 268 ms |
| [`feature_pivot_spreadsheet`](feature_pivot_spreadsheet.js) | Create then reshape a pivot on 20k rows | Pivot data loading, grouping, PIVOT spill | 647 ms |
| [`feature_pivot_formulas`](feature_pivot_formulas.js) | Open a static pivot of 1500 PIVOT.VALUE formulas | Pivot loading, per-domain value lookup | 414 ms |
| [`feature_charts`](feature_charts.js) | Display 17 charts on a 30k rows table, edit 8 times | Chart runtime computation and invalidation | 728 ms |
| [`export_json`](export_json.js) | Save a rich 15k rows workbook | JSON export of every plugin | 958 ms |
| [`collab_concurrent_edits`](collab_concurrent_edits.js) | Two users editing concurrently for 12 rounds | Collaborative session, operational transform | 1155 ms |
| [`render_grid_scrolling`](render_grid_scrolling.js) | Scroll a formatted 20k rows report, 150 frames | Grid renderer (headless canvas) | 529 ms |
| [`generic_business_workbook`](generic_business_workbook.js) | Open a business workbook and do a short session | Everything (broad health check) | 1304 ms |

## Not covered, and why

- **Copy / cut / paste.** Handled by `ClipboardStore`, which needs an Owl
  plugin scope (`usePlugin(NotificationPlugin)`) that cannot be created
  headlessly without relying on Owl internals.
- **XLSX export.** Needs the DOM `XMLSerializer` / `DOMParser`; shimming them
  with jsdom would mostly measure jsdom.
- **Moving rows / columns.** `MOVE_COLUMNS_ROWS` currently throws on
  ordinary data (`Cannot unsquish an offset without a preceding base cell`),
  e.g. cells `B2:"a" B3:"b" D2:"1" D3:"2"` then moving columns B:C before A.
- **Volatile functions.** The engine does not re-evaluate `RAND()` /
  `TODAY()` on unrelated edits, so there is no volatile recalculation cost to
  measure.
- **Very large sorts.** Sorting ~20k rows x 9 columns overflows the stack in
  `CommandSquisher.squish`; `struct_sort` stays at 7k rows.
