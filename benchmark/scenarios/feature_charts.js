/**
 * A dashboard with 17 charts (line, bar, pie, scatter, combo, scorecard,
 * gauge), most of them aggregating a 30k rows sales table directly. The
 * charts are computed for display, then the user edits source data 8 times
 * and the charts are recomputed after each edit.
 *
 * Stresses: chart runtime computation (dataset extraction from ranges,
 * labels formatting, aggregation, chart.js configuration building) and its
 * invalidation.
 */

import { REGIONS, SALESPEOPLE, colName, makeModel, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure, setCell } from "./lib/helpers.js";

const ROWS = 30000;
const MONTHS = 24;

export function setup({ Model }) {
    // The engine probes `window.Chart` (chart.js is not loaded headlessly)
    globalThis.window ??= globalThis;
    const last = ROWS + 1;
    const rnd = makeRandom(39);
    // pre-aggregated data, as pasted from another tool
    const monthly = [["Month", ...REGIONS]];
    for (let m = 0; m < MONTHS; m++) monthly.push([`=DATE(2024,${m + 1},1)`, ...REGIONS.map(() => String(rnd.int(20000, 90000)))]);
    const byRep = [["Salesperson", "Revenue", "Quantity"]];
    SALESPEOPLE.forEach((rep) => byRep.push([rep, String(rnd.int(100000, 500000)), String(rnd.int(500, 3000))]));
    const raw = workbook([
        sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS))),
        sheet("data", "Chart data", { ...matrixToCells(monthly), ...matrixToCells(byRep, { col: 8 }) }),
        sheet("dashboard", "Dashboard", {}),
    ]);
    const chartIds = [];
    const model = makeModel(Model, raw, (model) => {
        let n = 0;
        const add = (definition) => {
            const chartId = `chart${++n}`;
            chartIds.push(chartId);
            dispatch(model, "CREATE_CHART", {
                sheetId: "dashboard",
                figureId: `figure${n}`,
                chartId,
                col: (n % 4) * 6,
                row: Math.floor(n / 4) * 15,
                offset: { x: 0, y: 0 },
                size: { width: 480, height: 300 },
                definition: { title: { text: `Chart ${n}` }, legendPosition: "top", dataSetStyles: {}, ...definition },
            });
        };
        const range = (dataSets, labelRange) => ({
            type: "range",
            dataSets: dataSets.map((dataRange, i) => ({ dataRange, dataSetId: String(i) })),
            labelRange,
            dataSetsHaveTitle: true,
        });
        const regionSeries = REGIONS.map((_, i) => `'Chart data'!${colName(i + 1)}1:${colName(i + 1)}${MONTHS + 1}`);
        const months = `'Chart data'!A2:A${MONTHS + 1}`;
        add({ type: "line", dataSource: range(regionSeries, months), stacked: false, aggregated: false, cumulative: false, labelsAsText: false });
        add({ type: "line", dataSource: range(regionSeries, months), stacked: true, aggregated: false, cumulative: true, labelsAsText: false, fillArea: true });
        add({ type: "bar", dataSource: range(regionSeries, months), stacked: true, aggregated: false });
        add({ type: "bar", dataSource: range(["'Chart data'!J1:J41"], "'Chart data'!I2:I41"), stacked: false, aggregated: false, horizontal: true });
        add({ type: "combo", dataSource: range(["'Chart data'!J1:J41", "'Chart data'!K1:K41"], "'Chart data'!I2:I41"), aggregated: false });
        add({ type: "scatter", dataSource: range([`Sales!I1:I${last}`], `Sales!G2:G${last}`), aggregated: false, labelsAsText: false });
        add({ type: "scatter", dataSource: range([`Sales!I1:I${last}`], `Sales!H2:H${last}`), aggregated: false, labelsAsText: false });
        // charts aggregating the raw table directly
        add({ type: "bar", dataSource: range([`Sales!I1:I${last}`], `Sales!C2:C${last}`), stacked: false, aggregated: true });
        add({ type: "pie", dataSource: range([`Sales!I1:I${last}`], `Sales!F2:F${last}`), aggregated: true });
        add({ type: "line", dataSource: range([`Sales!G1:G${last}`], `Sales!E2:E${last}`), stacked: false, aggregated: true, cumulative: false, labelsAsText: true });
        add({ type: "bar", dataSource: range([`Sales!I1:I${last}`, `Sales!G1:G${last}`], `Sales!D2:D${last}`), stacked: false, aggregated: true });
        add({ type: "line", dataSource: range([`Sales!I1:I${last}`], `Sales!B2:B${last}`), stacked: false, aggregated: true, cumulative: true, labelsAsText: false });
        for (let i = 0; i < 4; i++) {
            add({ type: "scorecard", keyValue: `'Chart data'!${colName(i + 1)}${MONTHS + 1}`, baseline: `'Chart data'!${colName(i + 1)}${MONTHS}`, baselineMode: "percentage", baselineDescription: { text: "vs last month" } });
        }
        add({ type: "gauge", dataRange: "'Chart data'!J2", sectionRule: { colors: { lowerColor: "#cc0000", middleColor: "#f1c232", upperColor: "#6aa84f" }, rangeMin: "0", rangeMax: "300000", lowerInflectionPoint: { type: "number", value: "100000", operator: "<=" }, upperInflectionPoint: { type: "number", value: "200000", operator: "<=" } } });
    });
    return { model, chartIds };
}

export async function benchmark(engine, { model, chartIds }) {
    const computeAll = () => chartIds.forEach((chartId) => model.getters.getChartRuntime(chartId));
    measure("charts first display", computeAll);
    measure("edit and refresh", () => {
        for (let i = 0; i < 8; i++) {
            setCell(model, "sales", `G${2 + i * 1000}`, String(40 + i));
            computeAll();
        }
    });
}
