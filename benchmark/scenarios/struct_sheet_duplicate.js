/**
 * A user duplicates a 12k rows formatted sheet (formulas, styles, a table,
 * conditional formats) three times, e.g. to prepare monthly copies.
 *
 * Stresses: sheet duplication of every core plugin's data (cells, styles,
 * tables, CF...) and the evaluation of the copied formulas.
 */

import { makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure, rangeData } from "./lib/helpers.js";

const ROWS = 12000;

export function setup({ Model }) {
    const raw = workbook([sheet("template", "Template", matrixToCells(salesMatrix(ROWS)))]);
    const model = makeModel(Model, raw, (model) => {
        const sheetId = "template";
        dispatch(model, "SET_FORMATTING", { sheetId, target: [{ left: 7, right: 8, top: 1, bottom: ROWS }], format: "#,##0.00" });
        dispatch(model, "CREATE_TABLE", {
            sheetId,
            ranges: [rangeData(sheetId, `A1:I${ROWS + 1}`)],
            tableType: "static",
            config: { hasFilters: true, totalRow: false, firstColumn: false, lastColumn: false, numberOfHeaders: 1, bandedRows: true, bandedColumns: false, styleId: "TableStyleMedium2" },
        });
        dispatch(model, "ADD_CONDITIONAL_FORMAT", {
            sheetId,
            ranges: [rangeData(sheetId, `I2:I${ROWS + 1}`)],
            cf: { id: "big", rule: { type: "CellIsRule", operator: "isGreaterThan", values: ["1500"], style: { bold: true, textColor: "#9C0006" } } },
        });
    });
    return { model };
}

export async function benchmark(engine, { model }) {
    for (let i = 1; i <= 3; i++) {
        measure(`duplicate ${i}`, () => {
            dispatch(model, "DUPLICATE_SHEET", { sheetId: "template", sheetIdTo: `copy${i}`, sheetNameTo: `Month ${i}` });
        });
    }
}
