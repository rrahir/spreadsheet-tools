/**
 * A user renames a data sheet referenced by 24k formulas spread over 4
 * report sheets, renames it back, then moves sheets around.
 *
 * Stresses: updating every formula referencing a renamed sheet (formula
 * rewriting / re-tokenizing) and sheet-level operations.
 */

import { makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure } from "./lib/helpers.js";

const DATA_ROWS = 6000;

export function setup({ Model }) {
    const sheets = [sheet("data", "Data", matrixToCells(salesMatrix(DATA_ROWS)))];
    for (let s = 1; s <= 4; s++) {
        const cells = {};
        for (let r = 2; r <= DATA_ROWS + 1; r++) {
            cells[`A${r}`] = `=Data!A${r}`;
            cells[`B${r}`] = `=Data!I${r}*${s}`;
            cells[`C${r}`] = `=IF(Data!G${r}>25,Data!C${r},"")`;
        }
        cells.E1 = `=SUM(Data!I2:I${DATA_ROWS + 1})`;
        sheets.push(sheet(`report${s}`, `Report ${s}`, cells));
    }
    return { model: makeModel(Model, workbook(sheets)) };
}

export async function benchmark(engine, { model }) {
    measure("rename", () => {
        dispatch(model, "RENAME_SHEET", { sheetId: "data", oldName: "Data", newName: "Sales data 2025" });
        dispatch(model, "RENAME_SHEET", { sheetId: "data", oldName: "Sales data 2025", newName: "Data" });
    });
    measure("move sheets", () => {
        dispatch(model, "MOVE_SHEET", { sheetId: "data", delta: 3 });
        dispatch(model, "MOVE_SHEET", { sheetId: "report2", delta: -1 });
    });
}
