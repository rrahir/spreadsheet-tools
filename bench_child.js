// Child process for running benchmarked code
import { makeLargeDataset } from "./dataset_factory.js";

// Benchmark parameters are hard-coded here
const setupType = "formulas";
const cols = 26;
const rows = 5000;
const enginePath = "/home/odoo/odoo/packages/o-spreadsheet-engine/build/o-spreadsheet-engine.esm.js";

async function run() {
    const start = performance.now();
    const setupData = makeLargeDataset(cols, rows, [setupType]);
    const module = await import(enginePath);
    const Model = module.Model;
    const modelStart = performance.now();
    const model = new Model(setupData);
    const leaveStart = performance.now();
    model.leaveSession();
    const leaveEnd = performance.now();
    const end = performance.now();
    // Send timing data as JSON
    const result = {
        setup: modelStart - start,
        model: leaveStart - modelStart,
        leaveSession: leaveEnd - leaveStart,
        total: end - start
    };
    if (process.send) {
        process.send(result);
    } else {
        console.log(JSON.stringify(result));
    }
}

run();
