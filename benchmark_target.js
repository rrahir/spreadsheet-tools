// run.js
// User should put code to be measured here

import { makeLargeDataset } from "./dataset_factory.js";

export function setup() {
    // Setup code before measurement
    // Return any data needed for the main function
    return makeLargeDataset(26, 1000, ["formulas"]);
}

export async function main({ Model }, setupData) {
    // Your code here
    const model = new Model(setupData);
    model.leaveSession();
}
