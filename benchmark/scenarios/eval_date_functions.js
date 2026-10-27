/**
 * Open an order schedule deriving calendar information from 8k order dates:
 * year/month/week numbers, end of month, working days, due dates and
 * formatted period labels.
 *
 * Stresses: date functions (serial <-> calendar conversions, working-day
 * computations) and date formatting.
 */

import { matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";

const ROWS = 8000;

export function setup({ Model }) {
    const matrix = salesMatrix(ROWS);
    matrix[0].push("Year", "Month", "Week", "Weekday", "Month end", "Workdays left", "Due date", "Delivery", "Age (days)", "Period", "Quarter");
    for (let r = 2; r <= ROWS + 1; r++) {
        matrix[r - 1].push(
            `=YEAR(B${r})`,
            `=MONTH(B${r})`,
            `=ISOWEEKNUM(B${r})`,
            `=WEEKDAY(B${r},2)`,
            `=EOMONTH(B${r},0)`,
            `=NETWORKDAYS(B${r},N${r})`,
            `=WORKDAY(B${r},10)`,
            `=EDATE(B${r},1)`,
            `=DATEDIF(B${r},DATE(2026,1,1),"D")`,
            `=TEXT(B${r},"mmm yyyy")`,
            `="Q"&ROUNDUP(K${r}/3,0)&" "&J${r}`
        );
    }
    return { data: toCurrentData(Model, workbook([sheet("orders", "Orders", matrixToCells(matrix))])) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
