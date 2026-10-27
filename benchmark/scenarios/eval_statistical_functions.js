/**
 * Open a performance review sheet: each of 1200 orders is ranked and
 * positioned among all orders (RANK, rank within region, comparison with
 * the median), next to a summary using STDEV, PERCENTILE, LARGE, CORREL...
 *
 * Stresses: statistical functions over large ranges, and the quadratic
 * pattern of per-row formulas each scanning the whole column.
 */

import { matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";

const ROWS = 1200;

export function setup({ Model }) {
    const last = ROWS + 1;
    const rev = `$I$2:$I$${last}`;
    const qty = `$G$2:$G$${last}`;
    const matrix = salesMatrix(ROWS);
    matrix[0].push("Rank", "Rank in region", "Above median", "Z-score", "Top 10%");
    for (let r = 2; r <= last; r++) {
        matrix[r - 1].push(
            `=RANK(I${r},${rev})`,
            `=COUNTIFS($C$2:$C$${last},C${r},${rev},">"&I${r})+1`,
            `=I${r}>MEDIAN(${rev})`,
            `=(I${r}-AVERAGE(${rev}))/STDEV(${rev})`,
            `=I${r}>=PERCENTILE(${rev},0.9)`
        );
    }
    const summary = [
        ["Mean", `=AVERAGE(${rev})`],
        ["Median", `=MEDIAN(${rev})`],
        ["Std dev", `=STDEV(${rev})`],
        ["Variance", `=VAR(${rev})`],
        ["P90", `=PERCENTILE(${rev},0.9)`],
        ["Q1", `=QUARTILE(${rev},1)`],
        ["Correl qty/revenue", `=CORREL(${qty},${rev})`],
        ["Slope", `=SLOPE(${rev},${qty})`],
        ["Distinct qty", `=COUNTUNIQUE(${qty})`],
    ];
    for (let k = 1; k <= 20; k++) summary.push([`Top ${k}`, `=LARGE(${rev},${k})`]);
    const cells = { ...matrixToCells(matrix), ...matrixToCells(summary, { col: 16 }) };
    return { data: toCurrentData(Model, workbook([sheet("stats", "Stats", cells)])) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
