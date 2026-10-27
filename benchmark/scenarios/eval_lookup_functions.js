/**
 * Open a report that enriches 10k order ids with data looked up in a 10k
 * rows sales table: VLOOKUP, INDEX/MATCH and XLOOKUP exact matches, plus an
 * approximate VLOOKUP in a commission tier table.
 *
 * Stresses: lookup functions on large ranges (exact and sorted search),
 * range value extraction.
 */

import { makeRandom, matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";

const SALES = 10000;
const LOOKUPS = 10000;

export function setup({ Model }) {
    const rnd = makeRandom(5);
    const tiers = [["Revenue from", "Commission"]];
    for (let i = 0; i < 20; i++) tiers.push([String(i * 250), (0.01 + i * 0.0025).toFixed(4)]);
    const last = SALES + 1;
    const report = [["Order", "Salesperson", "Product", "Revenue", "Region", "Commission rate"]];
    for (let i = 0; i < LOOKUPS; i++) {
        const r = i + 2;
        report.push([
            `ORD-${100000 + rnd.int(0, SALES - 1)}`,
            `=VLOOKUP(A${r},Sales!$A$2:$I$${last},4,FALSE)`,
            `=INDEX(Sales!$E$2:$E$${last},MATCH(A${r},Sales!$A$2:$A$${last},0))`,
            `=XLOOKUP(A${r},Sales!$A$2:$A$${last},Sales!$I$2:$I$${last})`,
            `=XLOOKUP(A${r},Sales!$A$2:$A$${last},Sales!$C$2:$C$${last},"not found",0,-1)`,
            `=VLOOKUP(D${r},Tiers!$A$2:$B$21,2,TRUE)`,
        ]);
    }
    const raw = workbook([
        sheet("sales", "Sales", matrixToCells(salesMatrix(SALES))),
        sheet("tiers", "Tiers", matrixToCells(tiers)),
        sheet("report", "Report", matrixToCells(report)),
    ]);
    return { data: toCurrentData(Model, raw) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
