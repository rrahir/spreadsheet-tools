
/**
 * User entry point for code to be measured and benchmarked.
 */

import { makeLargeDataset } from "./dataset_factory.js";

/**
 * Branches to compare.
 */
export const branches = [
    "master",
    "master-range-tokenize-list-lul",
];
export const runsPerBranch = 50;

/**
 * Setup function run before measurement begins.
 */
export function setup() {
    // Return any data needed for the main function
    return makeLargeDataset(26, 5000, ["formulas"]);
}

/**
 * The actual code to benchmark.
 */
export async function main({ Model }, setupData) {
    // Your code here
    const model = new Model(setupData);
    model.leaveSession();
}
