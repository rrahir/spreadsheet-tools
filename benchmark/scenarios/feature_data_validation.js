/**
 * A 15k rows order entry sheet protected by data validation rules: dropdown
 * lists (from values and from a range), number bounds, date validity and a
 * custom formula. The user scrolls through the sheet looking for invalid
 * cells, then corrects some of them.
 *
 * Stresses: data validation evaluation (criterion checks for each visible
 * cell, range-based lists) and its invalidation after edits.
 */

import { REGIONS, SALESPEOPLE, makeModel, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure, rangeData, readViewport, setCell } from "./lib/helpers.js";

const ROWS = 15000;

function checkViewport(model, sheetId, top) {
    let invalid = 0;
    for (let row = top; row < top + 45; row++) {
        for (let col = 0; col < 9; col++) {
            if (model.getters.isDataValidationInvalid({ sheetId, col, row })) invalid++;
        }
    }
    return invalid;
}

export function setup({ Model }) {
    const lists = matrixToCells(SALESPEOPLE.slice(0, 35).map((rep) => [rep]));
    const raw = workbook([
        sheet("orders", "Orders", matrixToCells(salesMatrix(ROWS))),
        sheet("lists", "Lists", lists),
    ]);
    const model = makeModel(Model, raw, (model) => {
        const sheetId = "orders";
        const last = ROWS + 1;
        const addRule = (id, range, criterion) =>
            dispatch(model, "ADD_DATA_VALIDATION_RULE", { sheetId, ranges: [rangeData(sheetId, range)], rule: { id, criterion, isBlocking: false } });
        addRule("region", `C2:C${last}`, { type: "isValueInList", values: REGIONS, displayStyle: "arrow" });
        addRule("rep", `D2:D${last}`, { type: "isValueInRange", values: ["Lists!$A$1:$A$35"], displayStyle: "arrow" });
        addRule("qty", `G2:G${last}`, { type: "isBetween", values: ["1", "45"] });
        addRule("date", `B2:B${last}`, { type: "dateIsValid", values: [] });
        addRule("revenue", `I2:I${last}`, { type: "customFormula", values: ["=I2<=G2*H2*1.1"] });
    });
    return { model };
}

export async function benchmark(engine, { model }) {
    const sheetId = "orders";
    measure("scan", () => {
        for (let top = 0; top < ROWS; top += ROWS / 150) checkViewport(model, sheetId, top);
    });
    const rnd = makeRandom(37);
    measure("fix and recheck", () => {
        for (let i = 0; i < 30; i++) {
            const row = rnd.int(2, ROWS);
            setCell(model, sheetId, `G${row}`, String(rnd.int(1, 45)));
            checkViewport(model, sheetId, Math.max(0, row - 20));
            readViewport(model, sheetId, { top: Math.max(0, row - 20) });
        }
    });
}
