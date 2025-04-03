import { createSpreadsheetModel } from "@spreadsheet/helpers/model";

export const UPGRADE_DATA = {
    name: "Upgrade data",
    execute: function upgradeData(env, data) {
        return createSpreadsheetModel({ env, data }).exportData();
    }
}
