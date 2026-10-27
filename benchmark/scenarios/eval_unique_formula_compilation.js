/**
 * Open a hand-built financial model where almost every formula has its own
 * structure (nested IF / ROUND / SUM / MAX / arithmetic...), like the cells
 * of a business plan written one by one rather than dragged down.
 *
 * Stresses: tokenizer, parser and compiler. Compiled functions are cached by
 * formula *structure* (references and literals are normalized), so this
 * workload defeats the cache, unlike the other scenarios.
 */

import { colName, makeRandom, sheet, toCurrentData, workbook } from "./lib/data.js";

const FORMULAS = 15000;
const INPUT_ROWS = 200;
const INPUT_COLS = 10;

function randomExpression(rnd, depth) {
    const ref = () => `${colName(rnd.int(0, INPUT_COLS - 1))}${rnd.int(1, INPUT_ROWS)}`;
    const range = () => {
        const col = rnd.int(0, INPUT_COLS - 1);
        const row = rnd.int(1, INPUT_ROWS - 20);
        return `${colName(col)}${row}:${colName(Math.min(col + rnd.int(0, 2), INPUT_COLS - 1))}${row + rnd.int(1, 20)}`;
    };
    if (depth <= 0) {
        const leaf = rnd.next();
        return leaf < 0.6 ? ref() : leaf < 0.9 ? String(rnd.int(1, 100)) : `${rnd.int(1, 99)}%`;
    }
    const sub = () => randomExpression(rnd, depth - 1 - (rnd.next() < 0.3 ? 1 : 0));
    switch (rnd.int(0, 11)) {
        case 0: return `${sub()}+${sub()}`;
        case 1: return `${sub()}*${sub()}`;
        case 2: return `(${sub()}-${sub()})/${sub()}`;
        case 3: return `IF(${sub()}>${sub()},${sub()},${sub()})`;
        case 4: return `ROUND(${sub()},${rnd.int(0, 2)})`;
        case 5: return `SUM(${range()})*${sub()}`;
        case 6: return `MAX(${sub()},${sub()},${range()})`;
        case 7: return `MIN(${range()})+${sub()}`;
        case 8: return `IFERROR(${sub()}/${sub()},0)`;
        case 9: return `AVERAGE(${range()},${sub()})`;
        case 10: return `AND(${sub()}>0,${sub()}<${sub()})*${sub()}`;
        default: return `ABS(${sub()})^${rnd.int(1, 2)}`;
    }
}

export function setup({ Model }) {
    const rnd = makeRandom(13);
    const inputs = {};
    for (let col = 0; col < INPUT_COLS; col++) {
        for (let row = 1; row <= INPUT_ROWS; row++) inputs[`${colName(col)}${row}`] = String(rnd.int(1, 1000));
    }
    const model = {};
    for (let i = 0; i < FORMULAS; i++) {
        const cell = `${colName(i % 20)}${Math.floor(i / 20) + 1}`;
        model[cell] = `=${randomExpression(rnd, rnd.int(3, 5)).replace(/\b([A-J]\d+)\b/g, "Inputs!$1")}`;
    }
    const raw = workbook([sheet("inputs", "Inputs", inputs), sheet("plan", "Plan", model)]);
    return { data: toCurrentData(Model, raw) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
