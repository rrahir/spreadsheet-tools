import { helpers } from "@odoo/o-spreadsheet";
import { range } from "@web/core/utils/numbers";

const { toCartesian, toXC } = helpers;

export const TO_DYNAMIC_PIVOT = {
    name: "convert to dynamic pivot",
    execute: function toDynamicPivot(env, data, file) {
        if (file === "spreadsheet_dashboard_hr_payroll/data/files/payroll_dashboard.json") {
            return data; // skip for payroll dashboard
        }
        const sheet = data.sheets[0];
        for (const xc in sheet.cells) {
            const cells = sheet.cells;
            const content = cells[xc];
            if (content.startsWith("=PIVOT.HEADER(") && !content.includes('"measure"')) {
                const { col, row } = toCartesian(xc);
                const titleXc = toXC(col, row - 1);
                const titleContent = cells[titleXc];
                // extract title from "=_t("Country")"
                const pivotTitle = titleContent.match(/_t\("(.+)"\)/)?.[1] ?? titleContent;
                // =PIVOT.HEADER(7, "#country_id", 1)
                const pivotFormulaId = content.match(/=PIVOT\.HEADER\((\d+)/)[1];
                const pivotId = Object.entries(data.pivots).find(([, p]) => p.formulaId == pivotFormulaId)[0];
                // debugger
                data.pivots[pivotId].name = pivotTitle;
                
                let measureCol = col +1;
                let measureIndex = 0;
                const measures = data.pivots[pivotId].measures;
                // debugger;
                while (cells[toXC(measureCol, row-1)]) {
                    const measureTitleContent = cells[toXC(measureCol, row-1)];
                    if (measureTitleContent.startsWith("=_t(")) {
                        const measureTitle = measureTitleContent.match(/_t\("(.+)"\)/)[1];
                        if (file === "spreadsheet_dashboard_hr_referral/data/files/recruitment_dashboard.json" && measureTitle === "Rate") {
                            break;
                        }
                        if (measureTitle === "Ratio") {
                            break; // skip ratio for Invoicing dashboard -> calculated measure please
                        }
                        if (measureTitle === "Billable rate") {
                            break; // skip billable rate for Timesheets dashboard -> calculated measure please
                        }
                        measures[measureIndex].userDefinedName = measureTitle;
                    }
                    measureCol++;
                    measureIndex++;
                }
                // clear cells
                for (const c of range(col, measureCol)) {
                    delete cells[toXC(c, row -1)];
                }
                let nextRowContent = row;
                while (cells[toXC(col, nextRowContent)]?.includes("=PIVOT.HEADER")) {
                    for (const c of range(col, measureCol)) {
                        delete cells[toXC(c, nextRowContent)];
                    }
                    nextRowContent++;
                }
                sheet.cells[titleXc] = `=PIVOT(${pivotFormulaId}, 10, FALSE, FALSE)`;
                // for (const r of range(row, nextRowContent)) {
                // }
            }
        }
        return data;
    }
}

