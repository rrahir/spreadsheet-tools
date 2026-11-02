// A realistic multi-feature workbook: a sales table (formatted, as a table
// with filters, CF and DV), a product list used for lookups, a summary of
// SUMIFS, a pivot and a few charts.

import { CATEGORIES, PRODUCTS, SALESPEOPLE, colName, makeRandom, matrixToCells, salesMatrix, sheet, workbook } from "./data.js";
import { dispatch, rangeData } from "./helpers.js";

export function businessWorkbook(rows) {
    const last = rows + 1;
    const rnd = makeRandom(41);
    const products = [["Product", "Category", "List price", "Supplier"]];
    PRODUCTS.forEach((product, i) => products.push([product, CATEGORIES[i % CATEGORIES.length], (rnd.int(500, 50000) / 100).toFixed(2), `Supplier ${rnd.int(1, 12)}`]));
    const sales = salesMatrix(rows);
    sales[0].push("List price", "Discount", "Supplier");
    for (let r = 2; r <= last; r++) {
        sales[r - 1].push(`=VLOOKUP(E${r},Products!$A$2:$D$61,3,FALSE)`, `=IFERROR(1-H${r}/J${r},0)`, `=VLOOKUP(E${r},Products!$A$2:$D$61,4,FALSE)`);
    }
    const summary = [["Salesperson", ...CATEGORIES, "Total", "Share"]];
    SALESPEOPLE.forEach((rep, i) => {
        const r = i + 2;
        const line = [rep];
        CATEGORIES.forEach((_, c) => line.push(`=SUMIFS(Sales!$I$2:$I$${last},Sales!$D$2:$D$${last},$A${r},Sales!$F$2:$F$${last},${colName(c + 1)}$1)`));
        line.push(`=SUM(B${r}:F${r})`, `=G${r}/SUM($G$2:$G$41)`);
        summary.push(line);
    });
    const raw = workbook([
        sheet("sales", "Sales", matrixToCells(sales), { cols: 15 }),
        sheet("products", "Products", matrixToCells(products)),
        sheet("summary", "Summary", matrixToCells(summary)),
        sheet("pivot", "Pivot", { A1: "=PIVOT(1)" }),
    ]);
    return { raw, prepare: (model) => enrich(model, rows) };
}

function enrich(model, rows) {
    const last = rows + 1;
    const sheetId = "sales";
    const zone = (left, top, right, bottom) => [{ left, top, right, bottom }];
    dispatch(model, "SET_FORMATTING", { sheetId, target: zone(1, 1, 1, rows), format: "mm/dd/yyyy" });
    dispatch(model, "SET_FORMATTING", { sheetId, target: zone(7, 1, 9, rows), format: "[$$]#,##0.00" });
    dispatch(model, "SET_FORMATTING", { sheetId, target: zone(10, 1, 10, rows), format: "0.0%" });
    dispatch(model, "SET_FORMATTING", { sheetId: "summary", target: zone(1, 1, 6, 40), format: "#,##0" });
    dispatch(model, "SET_FORMATTING", { sheetId: "summary", target: zone(0, 0, 7, 0), style: { bold: true, fillColor: "#D9E1F2" } });
    dispatch(model, "CREATE_TABLE", {
        sheetId,
        ranges: [rangeData(sheetId, `A1:L${last}`)],
        tableType: "static",
        config: { hasFilters: true, totalRow: false, firstColumn: false, lastColumn: false, numberOfHeaders: 1, bandedRows: true, bandedColumns: false, styleId: "TableStyleMedium2" },
    });
    dispatch(model, "ADD_CONDITIONAL_FORMAT", {
        sheetId,
        ranges: [rangeData(sheetId, `K2:K${last}`)],
        cf: { id: "discount", rule: { type: "CellIsRule", operator: "isGreaterThan", values: ["0.2"], style: { textColor: "#9C0006", fillColor: "#FFC7CE" } } },
    });
    dispatch(model, "ADD_CONDITIONAL_FORMAT", {
        sheetId: "summary",
        ranges: [rangeData("summary", "G2:G41")],
        cf: { id: "totals", rule: { type: "DataBarRule", color: 0x638ec6 } },
    });
    dispatch(model, "ADD_DATA_VALIDATION_RULE", {
        sheetId,
        ranges: [rangeData(sheetId, `D2:D${last}`)],
        rule: { id: "rep", criterion: { type: "isValueInRange", values: ["Summary!$A$2:$A$41"], displayStyle: "arrow" }, isBlocking: false },
    });
    dispatch(model, "ADD_PIVOT", {
        pivotId: "p1",
        pivot: {
            type: "SPREADSHEET",
            name: "Revenue by region",
            dataSet: { sheetId, zone: { left: 0, right: 11, top: 0, bottom: rows } },
            rows: [{ fieldName: "Region" }, { fieldName: "Category" }],
            columns: [{ fieldName: "Date", granularity: "year" }],
            measures: [{ id: "Revenue:sum", fieldName: "Revenue", aggregator: "sum" }],
        },
    });
    const chart = (n, definition) =>
        dispatch(model, "CREATE_CHART", {
            sheetId: "summary",
            figureId: `figure${n}`,
            chartId: `chart${n}`,
            col: 10,
            row: n * 16,
            offset: { x: 0, y: 0 },
            size: { width: 500, height: 300 },
            definition: { title: { text: `Chart ${n}` }, legendPosition: "top", dataSetStyles: {}, ...definition },
        });
    chart(0, {
        type: "bar",
        stacked: true,
        aggregated: false,
        dataSource: { type: "range", dataSets: CATEGORIES.map((_, c) => ({ dataRange: `${colName(c + 1)}1:${colName(c + 1)}41`, dataSetId: String(c) })), labelRange: "A2:A41", dataSetsHaveTitle: true },
    });
    chart(1, {
        type: "pie",
        aggregated: true,
        dataSource: { type: "range", dataSets: [{ dataRange: `Sales!I1:I${last}`, dataSetId: "0" }], labelRange: `Sales!C2:C${last}`, dataSetsHaveTitle: true },
    });
}
