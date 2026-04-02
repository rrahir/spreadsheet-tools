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
 * Return an object with:
 *   - `data`       – first argument passed to `new Model(data, ...)`
 *   - `config`     – object of additional constructor arguments (optional)
 *  - `initialMessages` – array of messages to pre-populate the model with (optional)
 * @param {object} engineModule - The loaded engine module.
 * @param {string} branch - The branch currently being benchmarked.
 * @returns {{ data: object, config?: any, initialMessages?: any[] }}
 */
export function setup({ Model }, branch) {
  return {
    data: makeLargeDataset(52, 1_000, ["numbers"]),
    config: {},
    initialMessages : []
  };
}

/**
 * The actual code to benchmark.
 * If you want to benchmark custom event, use `console.debug()` with the format `<EventName> <number> ms`
 */
export async function benchmark(
  { Model },
  { data, config = undefined, initialMessages = [] },
) {
  const model = new Model(data, config, initialMessages);
  // Your code here
  model.leaveSession();
}
