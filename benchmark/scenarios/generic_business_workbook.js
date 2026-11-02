/**
 * Generic end-to-end scenario: open a business workbook (3k rows sales
 * table with lookups, a table with filters, CF, DV, SUMIFS summary, a pivot
 * and charts) and go through a typical short session: edit values, add a
 * row, filter, sort, undo, look at the charts and save.
 *
 * Unlike the other scenarios, this one deliberately mixes features: it is
 * a broad health check rather than a focused measurement.
 */

import { toCurrentData } from "./lib/data.js";
import { businessWorkbook } from "./lib/business_workbook.js";
import { dispatch, measure, readViewport, setCell } from "./lib/helpers.js";

const ROWS = 3000;

export function setup({ Model }) {
    globalThis.window ??= globalThis; // charts probe `window.Chart`
    const { raw, prepare } = businessWorkbook(ROWS);
    return { data: toCurrentData(Model, raw, prepare) };
}

export async function benchmark({ Model }, { data }) {
    const model = measure("open", () => new Model(data));
    const sheetId = "sales";
    measure("session", () => {
        readViewport(model, sheetId, { cols: 12 });
        for (let i = 0; i < 5; i++) {
            setCell(model, sheetId, `G${10 + i * 400}`, String(20 + i));
            readViewport(model, "summary", { cols: 8 });
        }
        dispatch(model, "ADD_COLUMNS_ROWS", { sheetId, sheetName: "Sales", dimension: "ROW", base: 5, position: "after", quantity: 1 });
        dispatch(model, "UPDATE_FILTER", { sheetId, col: 2, row: 0, value: { filterType: "values", hiddenValues: ["North", "West"] } });
        readViewport(model, sheetId, { cols: 12 });
        dispatch(model, "UPDATE_FILTER", { sheetId, col: 2, row: 0, value: { filterType: "values", hiddenValues: [] } });
        dispatch(model, "SORT_CELLS", { sheetId, col: 8, row: 1, zone: { left: 0, right: 11, top: 1, bottom: ROWS + 1 }, sortDirection: "desc", sortOptions: {} });
        readViewport(model, sheetId, { cols: 12 });
        dispatch(model, "REQUEST_UNDO");
        readViewport(model, "pivot", { cols: 6 });
        model.getters.getChartRuntime("chart0");
        model.getters.getChartRuntime("chart1");
    });
    measure("save", () => JSON.stringify(model.exportData()));
    model.leaveSession();
}
