/**
 * A 20k rows sales table with filters and SUBTOTAL formulas above it. The
 * user filters by region, then category, then with a "greater than"
 * criterion, and finally clears the filters, looking at the totals and the
 * visible rows each time.
 *
 * Stresses: filter evaluation (hidden rows computation), filtered-rows
 * aware functions (SUBTOTAL), table styling and header visibility.
 */

import { makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure, rangeData, readViewport } from "./lib/helpers.js";

const ROWS = 20000;
const HEADER_ROW = 3; // 0-based: the table starts below a totals block

export function setup({ Model }) {
    const first = HEADER_ROW + 2;
    const last = HEADER_ROW + ROWS + 1;
    const totals = [
        ["Visible orders", `=SUBTOTAL(103,A${first}:A${last})`, "Visible quantity", `=SUBTOTAL(109,G${first}:G${last})`],
        ["Visible revenue", `=SUBTOTAL(109,I${first}:I${last})`, "Average revenue", `=SUBTOTAL(101,I${first}:I${last})`],
    ];
    const matrix = salesMatrix(ROWS).map((line, i) => (i === 0 ? line : line.map((v) => (v.startsWith("=G") ? `=G${i + first - 1}*H${i + first - 1}` : v))));
    const cells = { ...matrixToCells(totals), ...matrixToCells(matrix, { row: HEADER_ROW }) };
    const model = makeModel(Model, workbook([sheet("sales", "Sales", cells)]), (model) => {
        dispatch(model, "CREATE_TABLE", {
            sheetId: "sales",
            ranges: [rangeData("sales", `A${HEADER_ROW + 1}:I${last}`)],
            tableType: "static",
            config: { hasFilters: true, totalRow: false, firstColumn: false, lastColumn: false, numberOfHeaders: 1, bandedRows: true, bandedColumns: false, styleId: "TableStyleMedium5" },
        });
    });
    return { model };
}

export async function benchmark(engine, { model }) {
    const sheetId = "sales";
    const filter = (col, value) => {
        dispatch(model, "UPDATE_FILTER", { sheetId, col, row: HEADER_ROW, value });
        readViewport(model, sheetId);
    };
    measure("filter values", () => {
        filter(2, { filterType: "values", hiddenValues: ["North", "South", "East"] });
        filter(5, { filterType: "values", hiddenValues: ["Software", "Services"] });
    });
    measure("filter criterion", () => {
        filter(8, { filterType: "criterion", type: "isGreaterThan", values: ["1000"] });
    });
    measure("clear filters", () => {
        for (const col of [2, 5, 8]) filter(col, { filterType: "values", hiddenValues: [] });
    });
}
