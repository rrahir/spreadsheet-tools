/**
 * A 20k rows sales table with 6 conditional formats (cell value rules,
 * color scale, data bar, icon set, row highlighting by formula). The user
 * scrolls through the sheet and edits 3 values.
 *
 * Stresses: conditional format evaluation (rule matching, color scale /
 * data bar / icon thresholds over large ranges) and its invalidation after
 * edits.
 */

import { makeModel, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure, rangeData, readViewport, setCell } from "./lib/helpers.js";

const ROWS = 20000;

export function setup({ Model }) {
    const model = makeModel(Model, workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS)))]), (model) => {
        const sheetId = "sales";
        const last = ROWS + 1;
        const addCf = (id, range, rule) => dispatch(model, "ADD_CONDITIONAL_FORMAT", { sheetId, ranges: [rangeData(sheetId, range)], cf: { id, rule } });
        addCf("bigRevenue", `I2:I${last}`, { type: "CellIsRule", operator: "isGreaterThan", values: ["2000"], style: { fillColor: "#C6EFCE", textColor: "#006100" } });
        addCf("north", `C2:C${last}`, { type: "CellIsRule", operator: "containsText", values: ["North"], style: { bold: true } });
        addCf("smallQty", `A2:I${last}`, { type: "CellIsRule", operator: "customFormula", values: ["=$G2<3"], style: { fillColor: "#FFC7CE" } });
        addCf("qtyScale", `G2:G${last}`, {
            type: "ColorScaleRule",
            minimum: { type: "value", color: 0xf8696b },
            midpoint: { type: "percentile", value: "50", color: 0xffeb84 },
            maximum: { type: "value", color: 0x63be7b },
        });
        addCf("revenueBar", `I2:I${last}`, { type: "DataBarRule", color: 0x638ec6 });
        addCf("priceIcons", `H2:H${last}`, {
            type: "IconSetRule",
            upperInflectionPoint: { type: "percentage", value: "66", operator: "gt" },
            lowerInflectionPoint: { type: "percentage", value: "33", operator: "gt" },
            icons: { upper: "arrowGood", middle: "dotNeutral", lower: "arrowBad" },
        });
    });
    return { model };
}

export async function benchmark(engine, { model }) {
    const sheetId = "sales";
    const rnd = makeRandom(35);
    measure("scroll", () => {
        for (let top = 0; top < ROWS; top += ROWS / 20) readViewport(model, sheetId, { top });
    });
    measure("edit and scroll", () => {
        for (let i = 0; i < 3; i++) {
            const row = rnd.int(2, ROWS);
            setCell(model, sheetId, `G${row}`, String(rnd.int(1, 60)));
            readViewport(model, sheetId, { top: Math.max(0, row - 20) });
        }
    });
}
