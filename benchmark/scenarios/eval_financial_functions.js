/**
 * Open a loan portfolio: for 6000 loans, compute payments with PMT / IPMT /
 * PPMT / FV, and the NPV and IRR of each loan's yearly cash flows.
 *
 * Stresses: financial functions, including iterative solvers (IRR, RATE).
 */

import { makeRandom, matrixToCells, sheet, toCurrentData, workbook } from "./lib/data.js";

const LOANS = 6000;

export function setup({ Model }) {
    const rnd = makeRandom(9);
    const header = ["Principal", "Rate", "Years", "Payment", "Interest 1st", "Principal 1st", "Balance 5y", "Implied rate"];
    for (let y = 0; y <= 10; y++) header.push(`CF ${y}`);
    header.push("NPV", "IRR");
    const matrix = [header];
    for (let i = 0; i < LOANS; i++) {
        const r = i + 2;
        const line = [
            String(rnd.int(10, 500) * 1000),
            (rnd.int(100, 900) / 10000).toFixed(4),
            String(rnd.int(5, 30)),
            `=PMT(B${r}/12,C${r}*12,-A${r})`,
            `=IPMT(B${r}/12,1,C${r}*12,-A${r})`,
            `=PPMT(B${r}/12,1,C${r}*12,-A${r})`,
            `=FV(B${r}/12,60,D${r},-A${r})`,
            `=RATE(C${r}*12,-D${r},A${r})*12`,
            `=-A${r}`,
        ];
        for (let y = 1; y <= 10; y++) line.push(`=D${r}*12*${(1 + rnd.int(-10, 10) / 100).toFixed(2)}`);
        line.push(`=NPV(0.05,J${r}:S${r})+I${r}`, `=IRR(I${r}:S${r})`);
        matrix.push(line);
    }
    return { data: toCurrentData(Model, workbook([sheet("loans", "Loans", matrixToCells(matrix))])) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
