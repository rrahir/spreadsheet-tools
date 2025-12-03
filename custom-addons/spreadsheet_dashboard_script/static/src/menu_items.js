/** @odoo-module **/

import { registries } from "@odoo/o-spreadsheet";
import * as scripts from "./scripts/index";
import {
  createSpreadsheetModel,
  freezeOdooData,
} from "@spreadsheet/helpers/model";
const { topbarMenuRegistry } = registries;

topbarMenuRegistry.addChild("dashboard-scripts", ["file"], {
    name: "Dashboard scripts",
    sequence: 70,
    isVisible: (env) => env.debug,
    isReadonlyAllowed: true,
    icon: "o-spreadsheet-Icon.DATA_CLEANUP",
});

for (const script of Object.values(scripts)) {
    topbarMenuRegistry.addChild(script.name, ["file", "dashboard-scripts"], {
        name: script.name,
        async execute(env) {
            const result = {}
            const dashboards = await env.services.orm.call("spreadsheet.dashboard", "get_dashboard_files");
            for (const [file, data] of Object.entries(dashboards)) {
                result[file] = script.execute(env, data);
            }
            await env.services.orm.call("spreadsheet.dashboard", "write_dashboard_files", [result]);
        }

    })
}

/**
 * To use the following menu item, you need to have all spreadsheet_dashboard_*
 * modules installed and the demo data loaded.
 *
 * You can find (at the time of this commit) the command line to load all the
 * spreadsheet_dashboard_* modules in runbot, in the build "fast testing"
 */
topbarMenuRegistry.addChild("create_sample", ["file", "dashboard-scripts"], {
    name: "Create sample dashboards",
    async execute(env) {
        const result = {};
        const dashboards = await env.services.orm.call(
            "spreadsheet.dashboard",
            "get_dashboard_files_for_sample",
        );
        for (const [file, data] of Object.entries(dashboards)) {
            const model = createSpreadsheetModel({ env, data });
            const dataFrozen = await freezeOdooData(model);
            dataFrozen.sheets = dataFrozen.sheets.slice(0, -1); // remove last sheet (global filters)
            dataFrozen.globalFilters = [];
            result[file] = dataFrozen;
        }
        await env.services.orm.call(
            "spreadsheet.dashboard",
            "write_dashboard_files",
            [result]
        );
    },
});
