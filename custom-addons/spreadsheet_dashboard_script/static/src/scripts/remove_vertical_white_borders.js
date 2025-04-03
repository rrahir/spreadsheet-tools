import { createSpreadsheetModel } from "@spreadsheet/helpers/model";

export const REMOVE_VERTICAL_WHITE_BORDERS = {
    name: "Remove vertical white borders",
    execute: function upgradeData(env, data) {
        for (const border of Object.values(data.borders)) {
            if (border.left?.color === "#FFFFFF") {
                delete border.left;
            }
            if (border.right?.color === "#FFFFFF") {
                delete border.right;
            }
        }
        return createSpreadsheetModel({ env, data }).exportData();
    }
}
