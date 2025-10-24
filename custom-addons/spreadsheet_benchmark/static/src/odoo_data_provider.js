import { OdooDataProvider } from "@spreadsheet/data_sources/odoo_data_provider";
import { patch } from "@web/core/utils/patch";


patch(OdooDataProvider.prototype, {
    notify() {
        super.notify();
        // use a setTimeout to check after the evaluation
        setTimeout(() => {
            if (!this.pendingPromises.size) {
                console.log("spreadsheet fully loaded")
            }
        })
    }
});