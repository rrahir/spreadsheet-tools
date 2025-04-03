import { helpers, links } from "@odoo/o-spreadsheet";
import { createSpreadsheetModel } from "@spreadsheet/helpers/model";

const { deepCopy, toZone } = helpers;
const { isMarkdownLink } = links;

export const ADD_TABLES = {
    name: "Add tables",
    execute: function upgradeData(env, data) {
        const blocks = new Set();
        const model = createSpreadsheetModel({ env, data: deepCopy(data) })
        const sheetId = model.getters.getActiveSheetId();
        for (const cellId of Object.keys(model.getters.getCells(sheetId))) {
            const { col, row } = model.getters.getCellPosition(cellId);
            model.selection.selectCell(col, row);
            model.selection.selectTableAroundSelection();
            const zone = model.getters.getSelectedZone();
            blocks.add(model.getters.zoneToXC(sheetId, zone));
        }
        const existingTables = new Set(data.sheets[0].tables.map(table => table.range));
        for (const block of blocks) {
            const zone = toZone(block);
            const cell = model.getters.getCell({ sheetId, col: zone.left, row: zone.top })
            if (cell && isMarkdownLink(cell.content)) {
                zone.top += 1;
            }
            if (zone.right - zone.left >= 1 && zone.bottom - zone.top >= 2) {
                const range = model.getters.zoneToXC(sheetId, zone);
                if (!existingTables.has(range)) {
                    data.sheets[0].tables.push({
                        range,
                        type: "static",
                        config: TABLE,
                    });
                }
            }
        }
        return data;
    }
}

const TABLE = {
    "hasFilters": false,
    "totalRow": false,
    "firstColumn": false,
    "lastColumn": false,
    "numberOfHeaders": 1,
    "bandedRows": true,
    "bandedColumns": false,
    "automaticAutofill": true,
    "styleId": "None"
};
