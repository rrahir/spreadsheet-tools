/**
 * A user formats a raw 20k rows export: header style, number and date
 * formats per column, borders, highlights of 60 individual rows, decimal
 * adjustments and a cleared column.
 *
 * Stresses: style / format / border storage on large zones, the merging and
 * splitting of formatted zones, and the history of formatting commands.
 */

import { makeModel, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure } from "./lib/helpers.js";

const ROWS = 20000;

export function setup({ Model }) {
    return { model: makeModel(Model, workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS)))])) };
}

export async function benchmark(engine, { model }) {
    const sheetId = "sales";
    const zone = (left, top, right, bottom) => [{ left, top, right, bottom }];
    measure("column formats", () => {
        dispatch(model, "SET_FORMATTING", { sheetId, target: zone(0, 0, 8, 0), style: { bold: true, fillColor: "#305496", textColor: "#FFFFFF" } });
        dispatch(model, "SET_FORMATTING", { sheetId, target: zone(1, 1, 1, ROWS), format: "dd mmm yyyy" });
        dispatch(model, "SET_FORMATTING", { sheetId, target: zone(7, 1, 8, ROWS), format: "[$€]#,##0.00" });
        dispatch(model, "SET_DECIMAL", { sheetId, target: zone(8, 1, 8, ROWS), step: 1 });
        dispatch(model, "SET_ZONE_BORDERS", { sheetId, target: zone(0, 0, 8, ROWS), border: { position: "all", style: "thin", color: "#BFBFBF" } });
        dispatch(model, "SET_ZONE_BORDERS", { sheetId, target: zone(0, 0, 8, 0), border: { position: "bottom", style: "thick", color: "#000000" } });
    });
    const rnd = makeRandom(27);
    measure("highlight rows", () => {
        for (let i = 0; i < 60; i++) {
            const row = rnd.int(1, ROWS);
            dispatch(model, "SET_FORMATTING", { sheetId, target: zone(0, row, 8, row), style: { fillColor: i % 2 ? "#FFF2CC" : "#FCE4D6" } });
        }
    });
    measure("clear formatting", () => {
        dispatch(model, "CLEAR_FORMATTING", { sheetId, target: zone(4, 0, 5, ROWS) });
    });
}
