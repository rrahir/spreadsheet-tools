/**
 * User entry point for code to be measured and benchmarked.
 */

import { makeLargeDataset } from "./dataset_factory.js";

/**
 * Branches to compare.
 */
export const branches = ["master"];
export const runsPerBranch = 20;

/**
 * Setup function run before measurement begins.
 */
export function setup({ Model }) {
  return makeLargeDataset(52, 1000, ["numbers"]);
}

/**
 * The actual code to benchmark.
 * If you want to benchmark custom event, use `console.debug()` with the format `<EventName> <number> ms`
 */
export async function benchmark({ Model }, setupData) {
  const model = new Model(setupData);
  // Your code here
  model.leaveSession();
}
