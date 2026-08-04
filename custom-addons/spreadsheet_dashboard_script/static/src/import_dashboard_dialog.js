/** @odoo-module **/

import { Component, proxy, t, useProps, xml } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { SelectMenu } from "@web/core/select_menu/select_menu";

export class ImportDashboardDialog extends Component {
    static components = { Dialog, SelectMenu };

    props = useProps({
        files: t.array(), // [{ name, data }]
        dashboards: t.array(), // get_dashboards() result
        defaults: t.array(), // data path (falsy for skip) per file
        onConfirm: t.function(), // (mapping: [{ file, dashboardPath }]) => void
        close: t.function(), // injected by the dialog service
    });

    setup() {
        this.state = proxy({ selection: this.props.defaults.slice() });
    }

    /** `SelectMenu` groups: one per module, each listing its dashboards. */
    get dashboardGroups() {
        const byModule = {};
        for (const dashboard of this.props.dashboards) {
            const path = dashboard.data.path;
            const module = path.split("/")[0];
            const fileName = path.split("/").pop();
            (byModule[module] ||= []).push({
                value: path,
                label: `${dashboard.name} · ${fileName}`,
            });
        }
        return Object.entries(byModule)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([module, choices]) => ({ label: module, choices }));
    }

    /** Set of data paths selected by more than one file. */
    get conflicts() {
        const counts = {};
        for (const path of this.state.selection) {
            if (path) {
                counts[path] = (counts[path] || 0) + 1;
            }
        }
        return new Set(Object.keys(counts).filter((path) => counts[path] > 1));
    }

    isConflicting(index) {
        const path = this.state.selection[index];
        return Boolean(path) && this.conflicts.has(path);
    }

    get matchedCount() {
        return this.state.selection.filter(Boolean).length;
    }

    get canImport() {
        return this.matchedCount > 0 && this.conflicts.size === 0;
    }

    onValueSelected(index, value) {
        this.state.selection = this.state.selection.map((current, i) =>
            i === index ? value : current
        );
    }

    confirm() {
        const mapping = [];
        this.props.files.forEach((file, index) => {
            const dashboardPath = this.state.selection[index];
            if (dashboardPath) {
                mapping.push({ file, dashboardPath });
            }
        });
        this.props.onConfirm(mapping);
        this.props.close();
    }
}

ImportDashboardDialog.template = xml`
    <Dialog title="'Import dashboards from files'" size="'lg'">
        <p>
            Match each file to the dashboard it should overwrite.
            Pre-filled from the file name — adjust if needed.
        </p>
        <table class="table table-sm align-middle">
            <thead>
                <tr>
                    <th>File</th>
                    <th>Target dashboard</th>
                </tr>
            </thead>
            <tbody>
                <tr t-foreach="this.props.files" t-as="file" t-key="file_index"
                    t-att-class="{ 'table-danger': this.isConflicting(file_index) }">
                    <td t-esc="file.name"/>
                    <td>
                        <SelectMenu
                            groups="this.dashboardGroups"
                            value="this.state.selection[file_index]"
                            placeholder="'— Skip —'"
                            onSelect="(value) => this.onValueSelected(file_index, value)"
                        />
                        <small t-if="this.isConflicting(file_index)" class="text-danger">
                            Already selected by another file.
                        </small>
                    </td>
                </tr>
            </tbody>
        </table>
        <t t-set-slot="footer">
            <button class="btn btn-primary" t-att-disabled="!this.canImport"
                t-on-click="() => this.confirm()">
                Import <t t-esc="this.matchedCount"/> file(s)
            </button>
            <button class="btn btn-secondary" t-on-click="() => this.props.close()">Cancel</button>
        </t>
    </Dialog>
`;
