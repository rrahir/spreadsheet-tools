/**
 * A user builds a pivot table from a 20k rows sales table: inserts it in a
 * new sheet (region > salesperson by category, sum of revenue and count),
 * then changes it to a monthly view, then sorts it on a measure.
 *
 * Stresses: spreadsheet pivot data loading (reading and typing the source
 * range), grouping / aggregation, and rendering of the PIVOT spreading
 * formula.
 */

import { makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure, readViewport, setCell } from "./lib/helpers.js";

const ROWS = 20000;

export function setup({ Model }) {
    const raw = workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS))), sheet("pivot", "Pivot", {}, { cols: 60, rows: 1500 })]);
    const model = makeModel(Model, raw, (model) => {
        dispatch(model, "SET_FORMATTING", { sheetId: "sales", target: [{ left: 1, right: 1, top: 1, bottom: ROWS }], format: "mm/dd/yyyy" });
    });
    return { model };
}

export async function benchmark(engine, { model }) {
    const definition = {
        type: "SPREADSHEET",
        name: "Sales analysis",
        dataSet: { sheetId: "sales", zone: { left: 0, right: 8, top: 0, bottom: ROWS } },
        rows: [{ fieldName: "Region" }, { fieldName: "Salesperson" }],
        columns: [{ fieldName: "Category" }],
        measures: [
            { id: "Revenue:sum", fieldName: "Revenue", aggregator: "sum" },
            { id: "Order ID:count", fieldName: "Order ID", aggregator: "count" },
        ],
    };
    measure("create pivot", () => {
        dispatch(model, "ADD_PIVOT", { pivotId: "p1", pivot: definition });
        const formulaId = model.getters.getPivotFormulaId("p1");
        setCell(model, "pivot", "A1", `=PIVOT(${formulaId})`);
        readViewport(model, "pivot");
    });
    measure("update pivot", () => {
        dispatch(model, "UPDATE_PIVOT", {
            pivotId: "p1",
            pivot: {
                ...definition,
                rows: [{ fieldName: "Date", granularity: "month_number" }, { fieldName: "Product" }],
                columns: [{ fieldName: "Region" }],
                measures: [{ id: "Quantity:sum", fieldName: "Quantity", aggregator: "sum" }, ...definition.measures],
            },
        });
        readViewport(model, "pivot");
    });
    measure("sort pivot", () => {
        dispatch(model, "UPDATE_PIVOT", {
            pivotId: "p1",
            pivot: { ...definition, sortedColumn: { order: "desc", measure: "Revenue:sum", domain: [] } },
        });
        readViewport(model, "pivot");
    });
}
