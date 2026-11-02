/**
 * Open a consolidation workbook: one sheet per branch (60 sheets of 250 rows)
 * and a summary sheet aggregating every branch with cross-sheet references.
 *
 * Stresses: per-sheet overhead (sheet creation, plugin state per sheet) and
 * cross-sheet reference resolution.
 */

import { matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";

const BRANCHES = 60;
const ROWS = 250;

export function setup({ Model }) {
    const sheets = [];
    const summary = [["Branch", "Orders", "Quantity", "Revenue", "Avg order", "Best order"]];
    for (let b = 1; b <= BRANCHES; b++) {
        const name = `Branch ${String(b).padStart(2, "0")}`;
        const matrix = salesMatrix(ROWS, { seed: b });
        const last = ROWS + 1;
        matrix.push(["Total", "", "", "", "", "", `=SUM(G2:G${last})`, "", `=SUM(I2:I${last})`]);
        sheets.push(sheet(`branch${b}`, name, matrixToCells(matrix), { cols: 12 }));
        const ref = `'${name}'`;
        summary.push([
            name,
            `=COUNTA(${ref}!A2:A${last})`,
            `=${ref}!G${last + 1}`,
            `=${ref}!I${last + 1}`,
            `=D${b + 1}/B${b + 1}`,
            `=MAX(${ref}!I2:I${last})`,
        ]);
    }
    summary.push(["Total", `=SUM(B2:B${BRANCHES + 1})`, `=SUM(C2:C${BRANCHES + 1})`, `=SUM(D2:D${BRANCHES + 1})`, `=D${BRANCHES + 2}/B${BRANCHES + 2}`, `=MAX(F2:F${BRANCHES + 1})`]);
    sheets.unshift(sheet("summary", "Summary", matrixToCells(summary)));
    return { data: toCurrentData(Model, workbook(sheets)) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
