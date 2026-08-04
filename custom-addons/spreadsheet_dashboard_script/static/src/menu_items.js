/** @odoo-module **/

import { registries } from "@odoo/o-spreadsheet";
import {
  findDashboardForFile,
  freezeSample,
  getOpenDashboardId,
  pickDashboardFiles,
} from "./helpers";
import { createSpreadsheetModel } from "@spreadsheet/helpers/model";
import { browser } from "@web/core/browser/browser";
import { download } from "@web/core/network/download";
import { _t } from "@web/core/l10n/translation";
import { ImportDashboardDialog } from "./import_dashboard_dialog";
const { topbarMenuRegistry } = registries;

/**
 * Write the files chosen in the import dialog: for each mapping, upgrade the
 * picked file's data onto the target dashboard's data path and regenerate its
 * sample, if any.
 */
async function writeImportedDashboards(env, mapping, byPath) {
    const filesToWrite = {};
    for (const { file, dashboardPath } of mapping) {
        const target = byPath[dashboardPath];
        const data = createSpreadsheetModel({ env, data: file.data }).exportData();
        filesToWrite[target.data.path] = data;
        if (target.sample) {
            filesToWrite[target.sample.path] = await freezeSample(env, data);
        }
    }
    if (!Object.keys(filesToWrite).length) {
        return;
    }
    await env.services.orm.call("spreadsheet.dashboard", "write_dashboard_files", [
        filesToWrite,
    ]);
    env.services.notification.add(
        _t("%s dashboard(s) written to disk.", mapping.length),
        { type: "success" }
    );
}

topbarMenuRegistry.addChild("dashboard-scripts", ["file"], {
    name: "Dashboard scripts",
    sequence: 70,
    isVisible: (env) => env.debug,
    isReadonlyAllowed: true,
    icon: "o-spreadsheet-Icon.DATA_CLEANUP",
});

/**
 * Round-trip every dashboard data file through the spreadsheet model to upgrade
 * it to the current data format, then write it back to disk.
 */
topbarMenuRegistry.addChild("upgrade_data", ["file", "dashboard-scripts"], {
    name: "Upgrade data",
    async execute(env) {
        const result = {};
        const dashboards = await env.services.orm.call(
            "spreadsheet.dashboard",
            "get_dashboards"
        );
        for (const dashboard of dashboards) {
            result[dashboard.data.path] = createSpreadsheetModel({
                env,
                data: dashboard.data.content,
            }).exportData();
            if (dashboard.sample) {
                result[dashboard.sample.path] = createSpreadsheetModel({
                    env,
                    data: dashboard.sample.content,
                }).exportData();
            }
        }
        await env.services.orm.call("spreadsheet.dashboard", "write_dashboard_files", [
            result,
        ]);
    },
});

/**
 * To use the following menu item, you need to have all spreadsheet_dashboard_*
 * modules installed and the demo data loaded.
 *
 * You can find (at the time of this commit) the command line to load all the
 * spreadsheet_dashboard_* modules in runbot, in the build "fast testing"
 */
topbarMenuRegistry.addChild("create_sample", ["file", "dashboard-scripts"], {
    name: "Create all sample dashboards",
    async execute(env) {
        const result = {};
        const dashboards = await env.services.orm.call(
            "spreadsheet.dashboard",
            "get_dashboards",
        );
        for (const dashboard of dashboards) {
            if (dashboard.sample) {
                result[dashboard.sample.path] = await freezeSample(env, dashboard.data.content);
            }
        }
        await env.services.orm.call(
            "spreadsheet.dashboard",
            "write_dashboard_files",
            [result]
        );
    },
});

/**
 * Import one or more edited spreadsheet files from the filesystem and use them
 * to regenerate dashboards on disk. A dialog lets the user match each file to
 * the dashboard it should overwrite, pre-filled from the file name; on confirm
 * each mapped file is upgraded, its revision id reset (on write), and written
 * back to the addons-path along with its regenerated sample file if any.
 */
topbarMenuRegistry.addChild("import_dashboards", ["file", "dashboard-scripts"], {
    name: "Import dashboards from files",
    isReadonlyAllowed: true,
    async execute(env) {
        const files = await pickDashboardFiles();
        if (!files.length) {
            return;
        }
        const dashboards = await env.services.orm.call(
            "spreadsheet.dashboard",
            "get_dashboards"
        );
        // Index by name and by data file base name to pre-fill the dialog, and
        // by data path to resolve the user's choice back to a dashboard.
        const byName = {};
        const byFile = {};
        const byPath = {};
        for (const dashboard of dashboards) {
            byName[dashboard.name] = dashboard;
            byFile[dashboard.data.path.split("/").pop()] = dashboard;
            byPath[dashboard.data.path] = dashboard;
        }
        const defaults = files.map((file) => {
            const match = findDashboardForFile(file.name, byName, byFile);
            return match ? match.data.path : "";
        });
        env.services.dialog.add(ImportDashboardDialog, {
            files,
            dashboards,
            defaults,
            onConfirm: (mapping) => writeImportedDashboards(env, mapping, byPath),
        });
    },
});

/**
 * Persist the current state of the open dashboard to disk: write its data file
 * (with proper formatting; the revision id is reset on write) and regenerate
 * its sample file, if any.
 */
topbarMenuRegistry.addChild("save_current_dashboard", ["file", "dashboard-scripts"], {
    name: "Save current dashboard to disk",
    async execute(env) {
        const dashboardId = getOpenDashboardId(env);
        if (dashboardId === undefined) {
            return;
        }
        // Resolve where to write on disk for the open dashboard.
        const { data: dataFile, sample: sampleFile } = await env.services.orm.call(
            "spreadsheet.dashboard",
            "get_dashboard_target_files",
            [dashboardId]
        );
        // Export the current state (the revision id is reset on write).
        const data = env.model.exportData();
        const filesToWrite = { [dataFile]: data };
        // Regenerate the sample from the current state, if there is one.
        if (sampleFile) {
            filesToWrite[sampleFile] = await freezeSample(env, data);
        }
        // Write the file(s) back to disk with proper formatting.
        await env.services.orm.call("spreadsheet.dashboard", "write_dashboard_files", [
            filesToWrite,
        ]);
        env.services.notification.add(
            sampleFile
                ? _t("Dashboard written to %s (sample: %s).", dataFile, sampleFile)
                : _t("Dashboard written to %s (no sample).", dataFile),
            { type: "success" }
        );
    },
});

/**
 * Reload the currently open dashboard from its source data file on disk,
 * discarding the edited state: the record is reset to the file server-side,
 * then the page is reloaded.
 */
topbarMenuRegistry.addChild("reload_dashboard_from_source", ["file", "dashboard-scripts"], {
    name: "Reload dashboard",
    isReadonlyAllowed: true,
    async execute(env) {
        const dashboardId = getOpenDashboardId(env);
        if (dashboardId === undefined) {
            return;
        }
        await env.services.orm.call("spreadsheet.dashboard", "reload_dashboard_from_source", [
            dashboardId,
        ]);
        browser.location.reload();
    },
});

/**
 * Reload every data-defined dashboard from its source data file on disk,
 * discarding edited states, then reload the page.
 */
topbarMenuRegistry.addChild("reload_all_dashboards_from_source", ["file", "dashboard-scripts"], {
    name: "Reload all dashboards",
    isReadonlyAllowed: true,
    async execute(env) {
        await env.services.orm.call(
            "spreadsheet.dashboard",
            "reload_all_dashboards_from_source"
        );
        browser.location.reload();
    },
});

/**
 * Download every dashboard data file as a single zip, keeping each file at its
 * source-relative path, so they can be processed by scripts offline (and copied
 * back over the addons-path) without going through the model getters/dispatches.
 */
topbarMenuRegistry.addChild("download_all_dashboards", ["file", "dashboard-scripts"], {
    name: "Download all dashboard files",
    isReadonlyAllowed: true,
    async execute() {
        await download({ url: "/spreadsheet_dashboard_script/download_all", data: {} });
    },
});
