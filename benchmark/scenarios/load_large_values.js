/**
 * Open a large data export: a 40k rows sales table made of plain values
 * (text, numbers, dates), without formulas.
 *
 * Stresses: data loading, cell import/parsing of literal contents, and the
 * initial evaluation of non-formula cells.
 */

import { matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";

export function setup({ Model }) {
    const cells = matrixToCells(salesMatrix(40000, { revenueFormula: false }));
    return { data: toCurrentData(Model, workbook([sheet("sales", "Sales", cells)])) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
