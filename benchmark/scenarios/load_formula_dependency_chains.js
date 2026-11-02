/**
 * Open a bank ledger where every row depends on the previous one (running
 * balance, running max, cumulative counters), producing dependency chains
 * 15k cells deep.
 *
 * Stresses: dependency graph construction and evaluation ordering of long,
 * deep chains (as opposed to wide, shallow dependencies).
 */

import { makeRandom, matrixToCells, sheet, toCurrentData, workbook } from "./lib/data.js";

const ROWS = 15000;

export function setup({ Model }) {
    const rnd = makeRandom(7);
    const matrix = [["Date", "Description", "Debit", "Credit", "Balance", "Max balance", "Nb debits", "Avg debit"]];
    matrix.push(["45292", "Opening balance", "0", "0", "10000", "=E2", "=IF(C2>0,1,0)", "=IFERROR(SUMIF($C$2:C2,\">0\")/G2,0)"]);
    for (let r = 3; r <= ROWS + 1; r++) {
        const isDebit = rnd.next() < 0.6;
        matrix.push([
            `=A${r - 1}+${rnd.int(0, 1)}`,
            rnd.pick(["Groceries", "Salary", "Rent", "Utilities", "Transfer", "Card payment"]),
            isDebit ? String(rnd.int(5, 500)) : "0",
            isDebit ? "0" : String(rnd.int(50, 3000)),
            `=E${r - 1}-C${r}+D${r}`,
            `=MAX(F${r - 1},E${r})`,
            `=G${r - 1}+IF(C${r}>0,1,0)`,
            `=IF(G${r}=0,0,(H${r - 1}*G${r - 1}+C${r})/G${r})`,
        ]);
    }
    return { data: toCurrentData(Model, workbook([sheet("ledger", "Ledger", matrixToCells(matrix))])) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
