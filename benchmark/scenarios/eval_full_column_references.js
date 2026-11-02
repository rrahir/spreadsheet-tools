/**
 * Open a dashboard whose formulas reference entire columns (A:A) of a data
 * sheet that has 10k filled rows but 50k rows in total, the usual pattern
 * of dashboards fed by a pasted / synchronized export.
 *
 * Stresses: handling of unbounded and full-column ranges, including their
 * empty tail, in aggregation and lookup functions.
 */

import { REGIONS, SALESPEOPLE, matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";

export function setup({ Model }) {
    const dashboard = [["Salesperson", "Orders", "Revenue", "Max order", "First order", "Big orders", "Share"]];
    SALESPEOPLE.forEach((rep, i) => {
        const r = i + 2;
        dashboard.push([
            rep,
            `=COUNTIF(Data!D:D,A${r})`,
            `=SUMIF(Data!D:D,A${r},Data!I:I)`,
            `=MAXIFS(Data!I:I,Data!D:D,A${r})`,
            `=INDEX(Data!A:A,MATCH(A${r},Data!D:D,0))`,
            `=COUNTIFS(Data!D:D,A${r},Data!I:I,">"&AVERAGE(Data!I:I))`,
            `=C${r}/SUM(Data!I:I)`,
        ]);
    });
    const regions = [["Region", "Orders", "Revenue", "Quantity"]];
    REGIONS.forEach((region, i) => {
        const r = i + 2;
        regions.push([region, `=COUNTIF(Data!C:C,A${r})`, `=SUMIF(Data!C:C,A${r},Data!I:I)`, `=SUMIF(Data!C:C,A${r},Data!G:G)`]);
    });
    const kpis = [
        ["Total revenue", "=SUM(Data!I:I)"],
        ["Orders", "=COUNTA(Data!A:A)-1"],
        ["Last date", "=MAX(Data!B:B)"],
        ["First date", "=MIN(Data!B:B)"],
        ["Avg quantity", "=AVERAGE(Data!G:G)"],
        ["Distinct products", "=COUNTA(UNIQUE(Data!E2:E))"],
    ];
    const raw = workbook([
        sheet("data", "Data", matrixToCells(salesMatrix(10000)), { rows: 50000 }),
        sheet("dashboard", "Dashboard", {
            ...matrixToCells(dashboard),
            ...matrixToCells(regions, { col: 8 }),
            ...matrixToCells(kpis, { col: 13 }),
        }),
    ]);
    return { data: toCurrentData(Model, raw) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
