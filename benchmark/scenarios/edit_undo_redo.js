/**
 * A user performs 36 varied edits (values, formulas, formatting, row
 * insertion/deletion) on a 2.5k rows sheet, then undoes all of them
 * and redoes all of them.
 *
 * Stresses: local history (recording of inverse changes, undo/redo replay)
 * and re-evaluation after each undo/redo step.
 */

import { makeModel, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure } from "./lib/helpers.js";

const ROWS = 2500;
const EDITS = 36;

export function setup({ Model }) {
    const matrix = salesMatrix(ROWS);
    matrix[0].push("Total revenue", `=SUM(I2:I${ROWS + 1})`);
    return { model: makeModel(Model, workbook([sheet("sales", "Sales", matrixToCells(matrix))])) };
}

export async function benchmark(engine, { model }) {
    const sheetId = "sales";
    const rnd = makeRandom(25);
    measure("edits", () => {
        for (let i = 0; i < EDITS; i++) {
            const row = rnd.int(1, ROWS - 10);
            const col = rnd.int(0, 8);
            switch (i % 6) {
                case 0:
                case 1:
                    dispatch(model, "UPDATE_CELL", { sheetId, col: 6, row, content: String(1000 + i) });
                    break;
                case 2:
                    dispatch(model, "UPDATE_CELL", { sheetId, col: 11, row, content: `=I${row + 1}*1.21` });
                    break;
                case 3:
                    dispatch(model, "SET_FORMATTING", { sheetId, target: [{ left: col, right: col, top: row, bottom: row + 50 }], style: { fillColor: "#FFF2CC", bold: true } });
                    break;
                case 4:
                    dispatch(model, "ADD_COLUMNS_ROWS", { sheetId, sheetName: "Sales", dimension: "ROW", base: row, position: "before", quantity: 2 });
                    break;
                case 5:
                    dispatch(model, "REMOVE_COLUMNS_ROWS", { sheetId, sheetName: "Sales", dimension: "ROW", elements: [row, row + 1] });
                    break;
            }
        }
    });
    measure("undo all", () => {
        for (let i = 0; i < EDITS; i++) dispatch(model, "REQUEST_UNDO");
    });
    measure("redo all", () => {
        for (let i = 0; i < EDITS; i++) dispatch(model, "REQUEST_REDO");
    });
}
