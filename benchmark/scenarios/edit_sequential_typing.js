/**
 * A user types 300 values one cell at a time (a new "Comment" column and
 * corrections of existing values) in a 30k rows sheet that has no formula
 * depending on the edited cells.
 *
 * Stresses: the fixed cost of a single user command on a large workbook
 * (dispatch, history, finalize, evaluation scheduling), independent of
 * formula evaluation.
 */

import { makeModel, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { setCell } from "./lib/helpers.js";

const ROWS = 30000;

export function setup({ Model }) {
    const raw = workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS, { revenueFormula: false })))]);
    return { model: makeModel(Model, raw) };
}

export async function benchmark(engine, { model }) {
    const rnd = makeRandom(23);
    for (let i = 0; i < 220; i++) {
        setCell(model, "sales", `J${i + 2}`, rnd.pick(["ok", "to check", "late delivery", "paid", "refunded"]));
    }
    for (let i = 0; i < 80; i++) {
        setCell(model, "sales", `C${rnd.int(2, ROWS + 1)}`, rnd.pick(["North", "South", "East", "West", "Central"]) + " ");
    }
}
