/**
 * A user adds 5 computed columns to a 10k rows sales table by typing the
 * formulas in the first row and dragging the autofill handle down to the
 * last row, then extends a numbering series the same way.
 *
 * Stresses: autofill rules (formula adaptation, series detection) and the
 * evaluation of thousands of newly created formulas. Autofill is handled by
 * a UI store, which is instantiated headlessly.
 */

import { makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { attachStores, dispatch, measure, select, setCell } from "./lib/helpers.js";

const ROWS = 10000;

export function setup({ Model, stores }) {
    const raw = workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS)), { cols: 20 })]);
    const model = makeModel(Model, raw);
    return { model, container: attachStores({ stores }, model, ["AutofillStore"]) };
}

export async function benchmark(engine, { model }) {
    const sheetId = "sales";
    const last = ROWS + 1;
    setCell(model, sheetId, "J2", "=I2*0.21");
    setCell(model, sheetId, "K2", '=IF(I2>1000,"Large","Small")');
    setCell(model, sheetId, "L2", '=TEXT(B2,"yyyy-mm")');
    setCell(model, sheetId, "M2", `=I2/SUM($I$2:$I$${last})`);
    setCell(model, sheetId, "N2", "=CONCATENATE(C2,\" - \",F2)");
    measure("autofill formulas", () => {
        select(model, "J2:N2");
        dispatch(model, "AUTOFILL_SELECT", { col: 13, row: ROWS });
        dispatch(model, "AUTOFILL");
    });
    setCell(model, sheetId, "P2", "1");
    setCell(model, sheetId, "P3", "2");
    measure("autofill series", () => {
        select(model, "P2:P3");
        dispatch(model, "AUTOFILL_SELECT", { col: 15, row: ROWS });
        dispatch(model, "AUTOFILL");
    });
}
