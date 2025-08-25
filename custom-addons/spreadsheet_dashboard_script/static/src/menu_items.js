/** @odoo-module **/

import { registries } from "@odoo/o-spreadsheet";
import * as scripts from "./scripts/index";
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
                result[file] = script.execute(env, data, file);
            }
            await env.services.orm.call("spreadsheet.dashboard", "write_dashboard_files", [result]);
        }

    })
}
