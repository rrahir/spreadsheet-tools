/**
 * A user sorts a 7k rows sales table (with a formula column and per-row
 * formatting) successively by revenue, salesperson and date.
 *
 * Stresses: the sort feature (value comparison of mixed types, building the
 * permutation) and the relocation of cells, formats and formulas.
 */

import { makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure } from "./lib/helpers.js";

// Sorting ~20k rows x 9 cols currently overflows the stack when the
// resulting commands are squished (CommandSquisher.squish spreads them).
const ROWS = 7000;

export function setup({ Model }) {
    const raw = workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS)))]);
    const model = makeModel(Model, raw, (model) => {
        const bands = [];
        for (let row = 2; row <= ROWS; row += 4) bands.push({ left: 0, right: 8, top: row, bottom: row });
        dispatch(model, "SET_FORMATTING", { sheetId: "sales", target: bands, style: { fillColor: "#F2F2F2" } });
    });
    return { model };
}

export async function benchmark(engine, { model }) {
    const zone = { left: 0, right: 8, top: 1, bottom: ROWS };
    const sort = (col, sortDirection) =>
        dispatch(model, "SORT_CELLS", { sheetId: "sales", col, row: 1, zone, sortDirection, sortOptions: {} });
    measure("sort by revenue", () => sort(8, "desc"));
    measure("sort by salesperson", () => sort(3, "asc"));
    measure("sort by date", () => sort(1, "asc"));
}
