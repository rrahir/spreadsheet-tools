/**
 * A sales table of 10k rows feeding a dashboard of SUMIFS / COUNTIFS (by
 * salesperson and category). The user corrects 15 quantities in the table,
 * checking the dashboard after each change.
 *
 * Stresses: incremental evaluation when the edited cell belongs to large
 * ranges referenced by many formulas (range dependency lookup, invalidation
 * of dependents), then reading the visible cells.
 */

import { CATEGORIES, SALESPEOPLE, colName, makeRandom, makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { readViewport, setCell } from "./lib/helpers.js";

const SALES = 10000;

export function setup({ Model }) {
    const last = SALES + 1;
    const col = (letter) => `Sales!$${letter}$2:$${letter}$${last}`;
    const dashboard = [["Salesperson", ...CATEGORIES, "Total", "Orders", "Avg qty"]];
    SALESPEOPLE.forEach((rep, i) => {
        const r = i + 2;
        const line = [rep];
        CATEGORIES.forEach((category, c) => line.push(`=SUMIFS(${col("I")},${col("D")},$A${r},${col("F")},${colName(c + 1)}$1)`));
        line.push(`=SUM(B${r}:F${r})`, `=COUNTIF(${col("D")},A${r})`, `=AVERAGEIF(${col("D")},A${r},${col("G")})`);
        dashboard.push(line);
    });
    dashboard.push(["Total", ...["B", "C", "D", "E", "F", "G", "H"].map((c) => `=SUM(${c}2:${c}41)`)]);
    const raw = workbook([
        sheet("sales", "Sales", matrixToCells(salesMatrix(SALES))),
        sheet("dashboard", "Dashboard", matrixToCells(dashboard)),
    ]);
    return { model: makeModel(Model, raw) };
}

export async function benchmark(engine, { model }) {
    const rnd = makeRandom(21);
    for (let i = 0; i < 15; i++) {
        setCell(model, "sales", `G${rnd.int(2, SALES + 1)}`, String(100 + i));
        readViewport(model, "dashboard", { cols: 9 });
    }
}
