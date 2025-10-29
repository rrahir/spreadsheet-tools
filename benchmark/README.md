# Odoo Spreadsheet Benchmarking Tool

This tool allows you to benchmark and compare the performance of code across different branches of the o-preadsheet repository. It runs your code multiple times on each branch, collects timing data for various events, and prints a detailed comparison report.

Each run is executed in a separate process to ensure isolation (JIT, caching, etc.).

## How to Use

1. **Edit `benchmark_target.js`:**
   - Set the branches you want to compare (`export const branches = [...]`).
   - Set the number of runs per branch (`export const runsPerBranch = ...`).
   - Implement the `setup()` function for any setup needed before benchmarking.
   - Implement the `main()` function with the code you want to benchmark. You can use `console.debug()` to log event timings in the format `EventName <number> ms`.

2. **Run the benchmark:**
   - Execute `start.js`:
     ```sh
     node benchmark/start.js
     ```
   - The tool will automatically switch branches, run your code, and print a report comparing performance across branches and events.

## Output Example

```
Global
  master-better-perf:   Mean: 60.16 ms, Stddev: 6.05 ms, n=10 (-18%)
  master:               Mean: 73.30 ms, Stddev: 3.53 ms, n=10
evaluate all cells
  master-better-perf:   Mean: 61.95 ms, Stddev: 4.38 ms, n=10 (-23%)
  master:               Mean: 80.03 ms, Stddev: 7.34 ms, n=10
```

## Notes
- Only modify `benchmark_target.js` for your benchmarking logic.
- The tool expects timing logs in the format `EventName <number> ms` for custom events.
- The total execution time is always reported as the "Global" event.
