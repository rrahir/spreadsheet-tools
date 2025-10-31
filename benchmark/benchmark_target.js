
/**
 * User entry point for code to be measured and benchmarked.
 */

import { makeLargeDataset } from "./dataset_factory.js";
import fs from "fs";

/**
 * Branches to compare.
 */
export const branches = [
    "master",
    "master-range-tokenize-list-lul",
];
export const runsPerBranch = 10;

/**
 * Setup function run before measurement begins.
 */
export function setup({ Model }) {
    const file = "/home/odoo/odoo/large spreadsheet files/18.0-lqv-worldHK SHOP-frozen.osheet.json";
    // open and load the file with node
    const data = fs.readFileSync(file, "utf8");
    const d = JSON.parse(data);
    return new Model(d).exportData();
}

/**
 * The actual code to benchmark.
 */
export async function main({ Model }, setupData) {
    // Your code here
    const model = new Model(setupData);
    model.leaveSession();
}
