/**
 * Open a report built from a pivot table "exploded" into individual
 * PIVOT.VALUE / PIVOT.HEADER formulas (as produced by inserting a static
 * pivot): 1500 formulas querying a pivot over 15k rows.
 *
 * Stresses: pivot loading and the lookup of individual pivot values by
 * domain (argument parsing, domain matching) for many formulas.
 */

import { CATEGORIES, SALESPEOPLE, colName, matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";
import { dispatch } from "./lib/helpers.js";

const ROWS = 15000;

export function setup({ Model }) {
    const report = [["", ...CATEGORIES.flatMap((c) => [`=PIVOT.HEADER(1,"Category","${c}")`, ""])]];
    report.push(["", ...CATEGORIES.flatMap(() => ['=PIVOT.HEADER(1,"measure","Revenue:sum")', '=PIVOT.HEADER(1,"measure","Quantity:sum")'])]);
    for (const year of [2024, 2025]) {
        for (const rep of SALESPEOPLE) {
            const line = [`=PIVOT.HEADER(1,"Date:year",${year},"Salesperson","${rep}")`];
            for (const category of CATEGORIES) {
                for (const measure of ["Revenue:sum", "Quantity:sum"]) {
                    line.push(`=PIVOT.VALUE(1,"${measure}","Date:year",${year},"Salesperson","${rep}","Category","${category}")`);
                }
            }
            report.push(line);
        }
    }
    const totalRow = report.length + 1;
    report.push(["Total", ...CATEGORIES.flatMap((_, i) => [`=SUM(${colName(1 + i * 2)}3:${colName(1 + i * 2)}${totalRow - 1})`, `=SUM(${colName(2 + i * 2)}3:${colName(2 + i * 2)}${totalRow - 1})`])]);
    const raw = workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS))), sheet("report", "Report", matrixToCells(report))]);
    const data = toCurrentData(Model, raw, (model) => {
        dispatch(model, "SET_FORMATTING", { sheetId: "sales", target: [{ left: 1, right: 1, top: 1, bottom: ROWS }], format: "mm/dd/yyyy" });
        dispatch(model, "ADD_PIVOT", {
            pivotId: "p1",
            pivot: {
                type: "SPREADSHEET",
                name: "Sales",
                dataSet: { sheetId: "sales", zone: { left: 0, right: 8, top: 0, bottom: ROWS } },
                rows: [{ fieldName: "Date", granularity: "year" }, { fieldName: "Salesperson" }],
                columns: [{ fieldName: "Category" }],
                measures: [
                    { id: "Revenue:sum", fieldName: "Revenue", aggregator: "sum" },
                    { id: "Quantity:sum", fieldName: "Quantity", aggregator: "sum" },
                ],
            },
        });
    });
    return { data };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
