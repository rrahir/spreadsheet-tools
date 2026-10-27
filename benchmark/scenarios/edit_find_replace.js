/**
 * A user searches a 30k rows workbook for a region name and replaces all
 * occurrences, then does a second search & replace on a product name.
 *
 * Stresses: scanning every cell's displayed text (as the find & replace
 * panel does) and the mass update of the matching cells.
 */

import { makeModel, matrixToCells, salesMatrix, sheet, workbook } from "./lib/data.js";
import { dispatch, measure } from "./lib/helpers.js";

const ROWS = 30000;
const SEARCH_OPTIONS = { matchCase: false, exactMatch: false, searchFormulas: false, includeHidden: false, searchScope: "allSheets" };

/** Same scan as FindAndReplaceStore.findMatchesInSheet */
function findMatches(model, regex) {
    const getters = model.getters;
    const matches = [];
    for (const sheetId of getters.getVisibleSheetIds()) {
        const { left, right, top, bottom } = getters.getSheetZone(sheetId);
        for (let row = top; row <= bottom; row++) {
            if (getters.isRowHidden(sheetId, row)) continue;
            for (let col = left; col <= right; col++) {
                if (getters.isColHidden(sheetId, col)) continue;
                const position = { sheetId, col, row };
                if (regex.test(getters.getCellText(position))) matches.push(position);
            }
        }
    }
    return matches;
}

export function setup({ Model }) {
    return { model: makeModel(Model, workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS)))])) };
}

export async function benchmark(engine, { model }) {
    for (const [searchString, replaceWith] of [["Central", "Middle"], ["Product 042", "Product 042 (discontinued)"]]) {
        const matches = measure("find", () => findMatches(model, new RegExp(searchString, "i")));
        measure("replace all", () => {
            dispatch(model, "REPLACE_SEARCH", { searchString, replaceWith, matches, searchOptions: SEARCH_OPTIONS });
        });
    }
}
