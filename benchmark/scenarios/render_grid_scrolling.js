/**
 * A user scrolls through a formatted 20k rows report (frozen header,
 * banded table style, number formats, borders, conditional formats, a
 * wrapped comment column and overflowing text), rendering 150 frames with
 * the real grid renderer, from top to bottom then sideways.
 *
 * Stresses: grid rendering (box computation for each visible cell: text
 * formatting, computed style, borders, CF, overflow and wrapping, frozen
 * panes, headers). The canvas itself is a no-op mock.
 */

import { makeModel, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, rangeData } from "./lib/helpers.js";
import { makeHeadlessGrid } from "./lib/render.js";

const ROWS = 20000;
const COMMENTS = ["ok", "Customer asked for a discount on the next order, to be validated by the sales manager", "late", "", "Delivered in two parts because of a stock shortage at the main warehouse", "paid"];

export function setup(engine) {
    const rnd = makeRandom(45);
    const matrix = salesMatrix(ROWS);
    matrix[0].push("Comment", "Internal note");
    for (let r = 1; r <= ROWS; r++) matrix[r].push(rnd.pick(COMMENTS), r % 7 ? "" : "This note is long enough to overflow on the next empty cells");
    const raw = workbook([sheet("report", "Report", matrixToCells(matrix), { cols: 30 })]);
    const model = makeModel(engine.Model, raw, (model) => {
        const sheetId = "report";
        const last = ROWS + 1;
        const zone = (left, top, right, bottom) => [{ left, top, right, bottom }];
        dispatch(model, "CREATE_TABLE", {
            sheetId,
            ranges: [rangeData(sheetId, `A1:I${last}`)],
            tableType: "static",
            config: { hasFilters: true, totalRow: false, firstColumn: true, lastColumn: false, numberOfHeaders: 1, bandedRows: true, bandedColumns: false, styleId: "TableStyleMedium9" },
        });
        dispatch(model, "SET_FORMATTING", { sheetId, target: zone(1, 1, 1, ROWS), format: "dd mmm yyyy" });
        dispatch(model, "SET_FORMATTING", { sheetId, target: zone(7, 1, 8, ROWS), format: "[$$]#,##0.00" });
        dispatch(model, "SET_FORMATTING", { sheetId, target: zone(9, 0, 9, ROWS), style: { wrapping: "wrap", verticalAlign: "top" } });
        dispatch(model, "SET_ZONE_BORDERS", { sheetId, target: zone(9, 0, 10, ROWS), border: { position: "all", style: "thin", color: "#BFBFBF" } });
        dispatch(model, "RESIZE_COLUMNS_ROWS", { sheetId, dimension: "COL", elements: [9], size: 220 });
        dispatch(model, "ADD_CONDITIONAL_FORMAT", {
            sheetId,
            ranges: [rangeData(sheetId, `I2:I${last}`)],
            cf: { id: "bar", rule: { type: "DataBarRule", color: 0x638ec6 } },
        });
        dispatch(model, "ADD_CONDITIONAL_FORMAT", {
            sheetId,
            ranges: [rangeData(sheetId, `G2:G${last}`)],
            cf: { id: "icons", rule: { type: "IconSetRule", upperInflectionPoint: { type: "number", value: "35", operator: "gt" }, lowerInflectionPoint: { type: "number", value: "15", operator: "gt" }, icons: { upper: "arrowGood", middle: "dotNeutral", lower: "arrowBad" } } },
        });
        dispatch(model, "FREEZE_ROWS", { sheetId, quantity: 1 });
        dispatch(model, "FREEZE_COLUMNS", { sheetId, quantity: 1 });
    });
    const grid = makeHeadlessGrid(engine, model, { width: 1600, height: 900 });
    grid.draw(); // first paint, before the user starts scrolling
    return { grid };
}

export async function benchmark(engine, { grid }) {
    // ~23px per row: 120 frames covering the first ~10k rows, then sideways
    for (let frame = 0; frame < 120; frame++) {
        grid.scrollTo(0, frame * 2000);
        grid.draw();
    }
    for (let frame = 0; frame < 30; frame++) {
        grid.scrollTo(frame * 40, 120 * 2000);
        grid.draw();
    }
}
