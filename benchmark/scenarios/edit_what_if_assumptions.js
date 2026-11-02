/**
 * A what-if profit simulation: 4000 scenarios all referencing the same 5
 * assumption cells ($B$2...), summarized by percentiles. The user tweaks
 * the assumptions 15 times, looking at the result after each change.
 *
 * Stresses: incremental re-evaluation with a high fan-out through
 * single-cell (absolute) references, followed by a deep cascade.
 */

import { makeRandom, matrixToCells, sheet, makeModel, workbook } from "./lib/data.js";
import { readViewport, setCell } from "./lib/helpers.js";

const DRAWS = 4000;

export function setup({ Model }) {
    const rnd = makeRandom(17);
    const assumptions = [
        ["Assumption", "Value"],
        ["Mean demand", "1000"],
        ["Demand spread", "150"],
        ["Unit price", "25"],
        ["Unit cost", "14"],
        ["Fixed costs", "8000"],
    ];
    const draws = [["Noise", "Demand", "Price", "Revenue", "Costs", "Profit", "Loss?", "Margin"]];
    for (let i = 1; i <= DRAWS; i++) {
        const r = i + 1;
        draws.push([
            ((rnd.next() + rnd.next() + rnd.next() - 1.5) * 2).toFixed(4),
            `=MAX(0,ROUND($B$2+D${r}*$B$3))`,
            `=$B$4*(1+D${r}/20)`,
            `=E${r}*F${r}`,
            `=E${r}*$B$5+$B$6`,
            `=G${r}-H${r}`,
            `=I${r}<0`,
            `=IFERROR(I${r}/G${r},0)`,
        ]);
    }
    const last = DRAWS + 1;
    const stats = [
        ["Mean profit", `=AVERAGE(I2:I${last})`],
        ["P(loss)", `=COUNTIF(J2:J${last},TRUE)/${DRAWS}`],
        ["P5", `=PERCENTILE(I2:I${last},0.05)`],
        ["Median", `=MEDIAN(I2:I${last})`],
        ["P95", `=PERCENTILE(I2:I${last},0.95)`],
        ["Avg margin", `=AVERAGE(K2:K${last})`],
    ];
    const cells = { ...matrixToCells(assumptions), ...matrixToCells(draws, { col: 3 }), ...matrixToCells(stats, { col: 12 }) };
    return { model: makeModel(Model, workbook([sheet("sim", "Simulation", cells)])) };
}

export async function benchmark(engine, { model }) {
    const values = ["1100", "160", "26", "13.5", "8500"];
    for (let i = 0; i < 15; i++) {
        setCell(model, "sim", `B${(i % 5) + 2}`, `${values[i % 5]}${i}`);
        readViewport(model, "sim", { cols: 14 });
    }
}
