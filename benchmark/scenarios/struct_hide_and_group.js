/**
 * A user structures a 40k rows journal: groups rows by month (outline),
 * folds and unfolds the groups, hides columns and individual rows, then
 * unhides everything.
 *
 * Stresses: header visibility computations (groups, folding, hidden
 * headers), header position recomputation, and visible-row lookups.
 */

import { makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure, readViewport } from "./lib/helpers.js";

const ROWS = 40000;
const MONTHS = 30;

export function setup({ Model }) {
    return { model: makeModel(Model, workbook([sheet("journal", "Journal", matrixToCells(salesMatrix(ROWS)))])) };
}

export async function benchmark(engine, { model }) {
    const sheetId = "journal";
    const groupSize = Math.floor(ROWS / MONTHS);
    measure("group", () => {
        for (let m = 0; m < MONTHS; m++) {
            dispatch(model, "GROUP_HEADERS", { sheetId, dimension: "ROW", start: 1 + m * groupSize, end: (m + 1) * groupSize - 1 });
        }
    });
    measure("fold unfold", () => {
        dispatch(model, "FOLD_ALL_HEADER_GROUPS", { sheetId, dimension: "ROW" });
        readViewport(model, sheetId);
        for (let m = 0; m < MONTHS; m++) {
            dispatch(model, "UNFOLD_HEADER_GROUP", { sheetId, dimension: "ROW", start: 1 + m * groupSize, end: (m + 1) * groupSize - 1 });
            readViewport(model, sheetId);
        }
        dispatch(model, "UNFOLD_ALL_HEADER_GROUPS", { sheetId, dimension: "ROW" });
    });
    measure("hide unhide", () => {
        dispatch(model, "HIDE_COLUMNS_ROWS", { sheetId, dimension: "COL", elements: [0, 4, 5] });
        for (let i = 0; i < 40; i++) {
            dispatch(model, "HIDE_COLUMNS_ROWS", { sheetId, dimension: "ROW", elements: [10 + i * 300, 11 + i * 300] });
        }
        readViewport(model, sheetId);
        dispatch(model, "UNHIDE_COLUMNS_ROWS", { sheetId, dimension: "ROW", elements: Array.from({ length: ROWS }, (_, i) => i) });
        dispatch(model, "UNHIDE_COLUMNS_ROWS", { sheetId, dimension: "COL", elements: [0, 4, 5] });
    });
}
