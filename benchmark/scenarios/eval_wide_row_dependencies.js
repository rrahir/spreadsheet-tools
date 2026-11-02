/**
 * A daily planning sheet laid out horizontally: one column per day over
 * ~5 years (1800 columns) and only a few rows per product (inputs and
 * metrics). Formulas mostly look along their own row: running totals and
 * stock chains referencing the previous day, rolling windows, year-to-date
 * ranges, exponential smoothing. Only a few reference other rows of the same
 * column. The user opens the sheet, then corrects 5 inputs of the first days,
 * which ripple along the whole rows.
 *
 * Stresses: dependencies spanning many columns and few rows (horizontal
 * chains and row ranges), as opposed to the usual tall tables.
 */

import { colName, makeRandom, matrixToCells, sheet, toCurrentData, workbook } from "./lib/data.js";
import { measure, readViewport, setCell } from "./lib/helpers.js";

const DAYS = 1800;
const PRODUCTS = 5;
const BLOCK = 16; // rows per product, including a blank separator row

/** Builds one product block starting at the 1-based spreadsheet row `top` */
function productBlock(rnd, product, top) {
    // rows (1-based) of the metrics referenced by formulas
    const r = (offset) => top + offset;
    const units = r(1), price = r(2), received = r(3), spend = r(4), revenue = r(5), cumRevenue = r(6), stock = r(7),
        avgUnits = r(8), maxStock = r(11), smoothedSpend = r(13);
    const lines = [
        [`Product ${product + 1}`],
        ["Units sold"],
        ["Unit price"],
        ["Units received"],
        ["Marketing spend"],
        ["Revenue"],
        ["Cumulative revenue"],
        ["Stock"],
        ["Units, 7 day average"],
        ["Revenue, rolling 30 days"],
        ["Units, year to date"],
        ["Highest stock so far"],
        ["Revenue growth"],
        ["Smoothed spend"],
        ["Reorder"],
    ];
    for (let d = 0; d < DAYS; d++) {
        const c = colName(d + 1);
        const prev = colName(d);
        const first = d === 0;
        const windowStart = (size) => colName(Math.max(1, d + 2 - size));
        const yearStart = colName(1 + d - (d % 365));
        lines[1].push(String(rnd.int(0, 40)));
        lines[2].push((rnd.int(900, 1100) / 100).toFixed(2));
        lines[3].push(d % 7 === 0 ? String(rnd.int(100, 250)) : "0");
        lines[4].push(String(rnd.int(0, 500)));
        lines[5].push(`=${c}${units}*${c}${price}`);
        lines[6].push(first ? `=${c}${revenue}` : `=${prev}${cumRevenue}+${c}${revenue}`);
        lines[7].push(first ? `=200+${c}${received}-${c}${units}` : `=MAX(0,${prev}${stock}+${c}${received}-${c}${units})`);
        lines[8].push(`=AVERAGE(${windowStart(7)}${units}:${c}${units})`);
        lines[9].push(`=SUM(${windowStart(30)}${revenue}:${c}${revenue})`);
        lines[10].push(`=SUM(${yearStart}${units}:${c}${units})`);
        lines[11].push(first ? `=${c}${stock}` : `=MAX(${prev}${maxStock},${c}${stock})`);
        lines[12].push(first ? "0" : `=IFERROR(${c}${revenue}/${prev}${revenue}-1,0)`);
        lines[13].push(first ? `=${c}${spend}` : `=${prev}${smoothedSpend}*0.9+${c}${spend}*0.1`);
        lines[14].push(`=IF(${c}${stock}<${c}${avgUnits}*7,"Reorder","")`);
    }
    // totals column right after the last day
    const last = colName(DAYS);
    for (const row of [units, received, spend, revenue]) lines[row - top].push(`=SUM(B${row}:${last}${row})`);
    lines[stock - top].push(`=MIN(B${stock}:${last}${stock})`);
    return lines;
}

export function setup({ Model }) {
    const rnd = makeRandom(47);
    const header = ["Day"];
    for (let d = 0; d < DAYS; d++) header.push(d === 0 ? "=DATE(2024,1,1)" : `=${colName(d)}1+1`);
    header.push("Total");
    const matrix = [header];
    for (let p = 0; p < PRODUCTS; p++) {
        matrix.push(...productBlock(rnd, p, 2 + p * BLOCK), []);
    }
    const raw = workbook([sheet("plan", "Plan", matrixToCells(matrix))]);
    return { data: toCurrentData(Model, raw) };
}

export async function benchmark({ Model }, { data }) {
    const model = measure("open", () => new Model(data));
    measure("edit first days", () => {
        for (let p = 0; p < PRODUCTS; p++) {
            const top = 2 + p * BLOCK;
            setCell(model, "plan", `C${top + 1}`, String(45 + p)); // units sold, day 2
            readViewport(model, "plan", { top: top - 1, rows: BLOCK, cols: 15 });
        }
    });
    // no leaveSession(): after edits, it would snapshot the whole workbook
}
