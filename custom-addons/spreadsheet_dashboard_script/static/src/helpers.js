/** @odoo-module **/

import { helpers } from "@odoo/o-spreadsheet";
import { createSpreadsheetModel, freezeOdooData } from "@spreadsheet/helpers/model";
import { router } from "@web/core/browser/router";
import { _t } from "@web/core/l10n/translation";
const { deepCopy } = helpers;

/**
 * Open a file picker dialog to select one or more JSON files.
 */
export function pickDashboardFiles() {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.multiple = true;
        input.addEventListener(
            "change",
            async () => {
                const files = await Promise.all(
                    [...input.files].map(async (file) => ({
                        name: file.name,
                        data: JSON.parse(await file.text()),
                    }))
                );
                resolve(files);
            },
            { once: true }
        );
        input.click();
    });
}

/**
 * Get the dashboard name from a downloaded file name. Downloads are named
 * `<dashboard name>.osheet.json`, with a possible ` (12)` suffix added by the
 * browser on duplicates. e.g. `Phone.osheet (36).json` -> `Phone`.
 */
function dashboardNameFromFileName(fileName) {
    return fileName.replace(/(\.osheet)?( \(\d+\))?\.json$/i, "");
}

/**
 * Remove the ` (12)` suffix a browser adds before the extension on duplicate
 * downloads, keeping the rest (extension included). Used to match a file name
 * against the data file name on the filestore. e.g. `a_dashboard (2).json` ->
 * `a_dashboard.json`.
 */
function stripDuplicateSuffix(fileName) {
    return fileName.replace(/ \(\d+\)(\.[^.]+)$/, "$1");
}

/**
 * Match a picked file to a dashboard, looking it up first by dashboard name
 * (files downloaded as `<name>.osheet.json`) and then by data file base name
 * (files named exactly like the one on the filestore). Returns the matching
 * dashboard, or `undefined` when none matches.
 */
export function findDashboardForFile(fileName, byName, byFile) {
    return (
        byName[dashboardNameFromFileName(fileName)] ||
        byFile[stripDuplicateSuffix(fileName)]
    );
}

/**
 * Freeze the given dashboard data into a sample file: a static snapshot with
 * the last sheet (global filters) removed and no global filters. The revision
 * id is reset when the file is written (see the model's write_dashboard_files).
 */
export async function freezeSample(env, data) {
    const sample = await freezeOdooData(
        createSpreadsheetModel({ env, data: deepCopy(data) })
    );
    sample.sheets = sample.sheets.slice(0, -1); // remove last sheet (global filters)
    sample.globalFilters = [];
    return sample;
}

/**
 * Return the id of the dashboard currently open in the editor, or `undefined`
 * (after notifying the user) when none is open.
 */
export function getOpenDashboardId(env) {
    const dashboardId = router.current.resId;
    if (typeof dashboardId !== "number") {
        env.services.notification.add(_t("No dashboard is currently open."), {
            type: "danger",
        });
        return undefined;
    }
    return dashboardId;
}
