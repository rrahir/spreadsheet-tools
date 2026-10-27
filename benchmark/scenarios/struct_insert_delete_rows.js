/**
 * A user inserts and deletes rows and columns in a 10k rows sales table
 * referenced by a summary sheet (300 formulas), conditional formats, a data
 * validation rule and a chart.
 *
 * Stresses: structural changes and the adaptation of everything pointing
 * at the sheet (formula references, ranges of CF / DV / charts), header
 * positions, and the following re-evaluation.
 */

import { SALESPEOPLE, makeModel, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure, rangeData } from "./lib/helpers.js";

const ROWS = 10000;

export function setup({ Model }) {
    const last = ROWS + 1;
    const summary = [["Salesperson", "Revenue", "Orders", "Top order", "Last date"]];
    SALESPEOPLE.forEach((rep, i) => {
        const r = i + 2;
        summary.push([rep, `=SUMIF(Sales!D2:D${last},A${r},Sales!I2:I${last})`, `=COUNTIF(Sales!D2:D${last},A${r})`, `=MAXIFS(Sales!I2:I${last},Sales!D2:D${last},A${r})`, `=MAXIFS(Sales!B2:B${last},Sales!D2:D${last},A${r})`]);
    });
    const checks = [];
    for (let i = 0; i < 100; i++) checks.push([`=Sales!I${2 + i * 97}`, `=Sales!G${2 + i * 97}*Sales!H${2 + i * 97}`]);
    const raw = workbook([
        sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS))),
        sheet("summary", "Summary", { ...matrixToCells(summary), ...matrixToCells(checks, { col: 7 }) }),
    ]);
    const model = makeModel(Model, raw, (model) => {
        const sheetId = "sales";
        dispatch(model, "ADD_CONDITIONAL_FORMAT", {
            sheetId,
            ranges: [rangeData(sheetId, `I2:I${last}`)],
            cf: { id: "cf1", rule: { type: "CellIsRule", operator: "isGreaterThan", values: ["1000"], style: { fillColor: "#C6EFCE" } } },
        });
        dispatch(model, "ADD_CONDITIONAL_FORMAT", {
            sheetId,
            ranges: [rangeData(sheetId, `G2:G${last}`)],
            cf: { id: "cf2", rule: { type: "ColorScaleRule", minimum: { type: "value", color: 0xffffff }, maximum: { type: "value", color: 0x63be7b } } },
        });
        dispatch(model, "ADD_DATA_VALIDATION_RULE", {
            sheetId,
            ranges: [rangeData(sheetId, `G2:G${last}`)],
            rule: { id: "dv1", criterion: { type: "isBetween", values: ["1", "50"] }, isBlocking: false },
        });
        dispatch(model, "CREATE_CHART", {
            sheetId: "summary",
            figureId: "fig1",
            chartId: "chart1",
            col: 8,
            row: 1,
            offset: { x: 0, y: 0 },
            size: { width: 500, height: 300 },
            definition: {
                type: "bar",
                title: { text: "Revenue" },
                legendPosition: "none",
                dataSource: { type: "range", dataSets: [{ dataRange: "B1:B41", dataSetId: "0" }], labelRange: "A2:A41", dataSetsHaveTitle: true },
                dataSetStyles: {},
                stacked: false,
                aggregated: false,
            },
        });
    });
    return { model };
}

export async function benchmark(engine, { model }) {
    const sheetId = "sales";
    const sheetName = "Sales";
    const rnd = makeRandom(31);
    measure("insert rows", () => {
        for (let i = 0; i < 5; i++) {
            dispatch(model, "ADD_COLUMNS_ROWS", { sheetId, sheetName, dimension: "ROW", base: rnd.int(1, ROWS), position: "before", quantity: i === 0 ? 100 : 1 });
        }
    });
    measure("delete rows", () => {
        for (let i = 0; i < 5; i++) {
            const row = rnd.int(1, ROWS);
            dispatch(model, "REMOVE_COLUMNS_ROWS", { sheetId, sheetName, dimension: "ROW", elements: i === 0 ? Array.from({ length: 50 }, (_, k) => row + k) : [row] });
        }
    });
    measure("insert delete columns", () => {
        dispatch(model, "ADD_COLUMNS_ROWS", { sheetId, sheetName, dimension: "COL", base: 2, position: "after", quantity: 1 });
        dispatch(model, "REMOVE_COLUMNS_ROWS", { sheetId, sheetName, dimension: "COL", elements: [0] });
        dispatch(model, "ADD_COLUMNS_ROWS", { sheetId, sheetName, dimension: "COL", base: 0, position: "before", quantity: 2 });
    });
}
