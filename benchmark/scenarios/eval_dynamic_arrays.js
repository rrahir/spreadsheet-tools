/**
 * Open an analysis sheet built with dynamic array formulas over a 10k rows
 * table: UNIQUE lists, per-salesperson FILTER extracts, SORT of filtered
 * data, SEQUENCE-driven calendars, and formulas consuming the spilled
 * results.
 *
 * Stresses: array formula evaluation, spreading of results (spill
 * management, collisions) and dependencies on spilled cells.
 */

import { matrixToCells, salesMatrix, sheet, toCurrentData, workbook, colName } from "./lib/data.js";

const SALES = 10000;
const EXTRACTS = 12;

export function setup({ Model }) {
    const last = SALES + 1;
    const r = (letter) => `Sales!${letter}2:${letter}${last}`;
    const cells = {
        A1: "Salespeople",
        A2: `=SORT(UNIQUE(${r("D")}))`,
        B1: "Revenue",
        C1: "Products",
        C2: `=SORT(UNIQUE(${r("E")}))`,
        D1: "Product revenue",
        E1: "Top 50 orders",
        E2: `=TAKE(SORT(Sales!A2:I${last},9,-1),50)`,
        O1: "Calendar",
        O2: "=SEQUENCE(730,1,DATE(2024,1,1))",
        P1: "Orders/day",
    };
    for (let i = 2; i <= 41; i++) cells[`B${i}`] = `=SUM(FILTER(${r("I")},${r("D")}=A${i}))`;
    for (let i = 2; i <= 61; i++) cells[`D${i}`] = `=SUMPRODUCT((${r("E")}=C${i})*${r("I")})`;
    for (let i = 2; i <= 731; i++) cells[`P${i}`] = `=ROWS(FILTER(${r("A")},${r("B")}=O${i},""))`;
    // one block of extracted orders per salesperson, side by side
    const extracts = {};
    for (let e = 0; e < EXTRACTS; e++) {
        const c = colName(e * 10);
        extracts[`${c}1`] = `=Analysis!A${e + 2}`;
        extracts[`${c}2`] = `=SORT(FILTER(Sales!A2:I${last},${r("D")}=${c}1,${r("I")}>500),9,-1)`;
    }
    const raw = workbook([
        sheet("sales", "Sales", matrixToCells(salesMatrix(SALES))),
        sheet("analysis", "Analysis", cells, { rows: 800 }),
        sheet("extracts", "Extracts", extracts, { cols: EXTRACTS * 10, rows: 500 }),
    ]);
    return { data: toCurrentData(Model, raw) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
