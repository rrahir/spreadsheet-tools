import { AbstractSpreadsheetAction } from "@spreadsheet_edition/bundle/actions/abstract_spreadsheet_action";
import { patch } from "@web/core/utils/patch";
import { globalFieldMatchingRegistry } from "@spreadsheet/global_filters/helpers";

patch(AbstractSpreadsheetAction.prototype, {
    createModel() {
        super.createModel();
        const hasDataSource = () => {
            for (const matcher of globalFieldMatchingRegistry.getAll()) {
                if (matcher.getIds(this.model.getters).length) {
                    return true;
                }
            }
            return false;
        }
        if (!hasDataSource()) {
            console.log("spreadsheet fully loaded")
        }
    }
});