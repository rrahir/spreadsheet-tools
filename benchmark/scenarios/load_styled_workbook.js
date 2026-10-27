/**
 * Open a heavily formatted report, as typically imported from Excel: banded
 * rows, per-column number formats, borders around every cell, and many
 * individually colored cells.
 *
 * Stresses: import of styles / formats / borders (zone-based storage), style
 * deduplication, and the cost of a fragmented style map.
 */

import { CATEGORIES, makeRandom, matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";
import { dispatch } from "./lib/helpers.js";

const ROWS = 10000;
const COLORS = ["#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050", "#00B050", "#00B0F0", "#0070C0", "#002060", "#7030A0"];

export function setup({ Model }) {
    const raw = workbook([sheet("report", "Report", matrixToCells(salesMatrix(ROWS, { revenueFormula: false })))]);
    const data = toCurrentData(Model, raw, (model) => {
        const sheetId = "report";
        const zone = (left, top, right, bottom) => ({ left, top, right, bottom });
        const rnd = makeRandom(3);
        dispatch(model, "SET_FORMATTING", { sheetId, target: [zone(0, 0, 8, 0)], style: { bold: true, fillColor: "#1F4E78", textColor: "#FFFFFF", align: "center" } });
        dispatch(model, "SET_FORMATTING", { sheetId, target: [zone(1, 1, 1, ROWS)], format: "mm/dd/yyyy" });
        dispatch(model, "SET_FORMATTING", { sheetId, target: [zone(7, 1, 8, ROWS)], format: "[$$]#,##0.00" });
        dispatch(model, "SET_FORMATTING", { sheetId, target: [zone(6, 1, 6, ROWS)], format: "#,##0" });
        // banded rows
        const bands = [];
        for (let row = 2; row <= ROWS; row += 2) bands.push(zone(0, row, 8, row));
        dispatch(model, "SET_FORMATTING", { sheetId, target: bands, style: { fillColor: "#DDEBF7" } });
        // category column: one fill color per category
        const byCategory = CATEGORIES.map(() => []);
        for (let row = 1; row <= ROWS; row++) {
            const category = model.getters.getEvaluatedCell({ sheetId, col: 5, row }).value;
            byCategory[CATEGORIES.indexOf(category)].push(zone(5, row, 5, row));
        }
        byCategory.forEach((target, i) => dispatch(model, "SET_FORMATTING", { sheetId, target, style: { fillColor: COLORS[i] } }));
        // manual highlighting of individual cells
        const highlights = {};
        for (let i = 0; i < 4000; i++) {
            const col = rnd.int(0, 8);
            const row = rnd.int(1, ROWS);
            const key = [rnd.int(0, COLORS.length - 1), rnd.next() < 0.3, rnd.next() < 0.2].join("|");
            (highlights[key] ||= []).push(zone(col, row, col, row));
        }
        for (const [key, target] of Object.entries(highlights)) {
            const [color, bold, italic] = key.split("|");
            dispatch(model, "SET_FORMATTING", { sheetId, target, style: { textColor: COLORS[color], bold: bold === "true", italic: italic === "true" } });
        }
        dispatch(model, "SET_ZONE_BORDERS", { sheetId, target: [zone(0, 0, 8, ROWS)], border: { position: "all", style: "thin", color: "#808080" } });
    });
    return { data };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
