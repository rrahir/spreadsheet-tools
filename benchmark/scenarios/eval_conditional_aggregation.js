/**
 * Open a sales dashboard computing, over a 20k rows table, a
 * salesperson x month matrix of SUMIFS, and region x category COUNTIFS /
 * AVERAGEIFS, all with bounded ranges.
 *
 * Stresses: criteria-based aggregation functions (criterion parsing and
 * matching over large ranges), many formulas sharing the same ranges.
 */

import { CATEGORIES, REGIONS, SALESPEOPLE, colName, matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";

const SALES = 20000;
const MONTHS = 24;

export function setup({ Model }) {
    const last = SALES + 1;
    const col = (letter) => `Sales!$${letter}$2:$${letter}$${last}`;
    const byRep = [["Salesperson"]];
    for (let m = 0; m < MONTHS; m++) byRep[0].push(`=DATE(2024,${m + 1},1)`);
    SALESPEOPLE.forEach((rep, i) => {
        const r = i + 2;
        const line = [rep];
        for (let m = 0; m < MONTHS; m++) {
            const c = colName(m + 1);
            line.push(`=SUMIFS(${col("I")},${col("D")},$A${r},${col("B")},">="&${c}$1,${col("B")},"<"&EDATE(${c}$1,1))`);
        }
        byRep.push(line);
    });
    const byRegion = [["Region / Category", ...CATEGORIES.flatMap((c) => [`${c} count`, `${c} avg`, `${c} big orders`])]];
    REGIONS.forEach((region) => {
        const line = [region];
        for (const category of CATEGORIES) {
            line.push(
                `=COUNTIFS(${col("C")},"${region}",${col("F")},"${category}")`,
                `=AVERAGEIFS(${col("I")},${col("C")},"${region}",${col("F")},"${category}")`,
                `=COUNTIFS(${col("C")},"${region}",${col("F")},"${category}",${col("I")},">1000")`
            );
        }
        byRegion.push(line);
    });
    const raw = workbook([
        sheet("sales", "Sales", matrixToCells(salesMatrix(SALES))),
        sheet("byrep", "By salesperson", matrixToCells(byRep)),
        sheet("byregion", "By region", matrixToCells(byRegion)),
    ]);
    return { data: toCurrentData(Model, raw) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
