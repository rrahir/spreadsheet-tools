/**
 * Open a contact list being cleaned up with text formulas: trimming,
 * capitalization, concatenation, email parsing with FIND/MID, phone
 * normalization with nested SUBSTITUTE, TEXT formatting of dates.
 *
 * Stresses: string functions and string-heavy evaluation (allocation,
 * conversions between numbers and text).
 */

import { contactsMatrix, matrixToCells, sheet, toCurrentData, workbook } from "./lib/data.js";

const ROWS = 8000;

export function setup({ Model }) {
    const matrix = contactsMatrix(ROWS);
    matrix[0].push("First", "Last", "Full name", "Login", "Domain", "Phone", "City", "Signup", "Initials", "Valid");
    for (let r = 2; r <= ROWS + 1; r++) {
        matrix[r - 1].push(
            `=PROPER(TRIM(A${r}))`,
            `=PROPER(TRIM(B${r}))`,
            `=CONCATENATE(G${r}," ",H${r})`,
            `=LOWER(LEFT(C${r},FIND("@",C${r})-1))`,
            `=MID(C${r},FIND("@",C${r})+1,LEN(C${r}))`,
            `=SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(D${r},"(",""),")","")," ",""),"-","")`,
            `=UPPER(E${r})`,
            `=TEXT(F${r},"yyyy-mm-dd")`,
            `=LEFT(G${r},1)&"."&LEFT(H${r},1)&"."`,
            `=AND(LEN(L${r})=12,ISNUMBER(SEARCH(".com",K${r})),EXACT(J${r},LOWER(J${r})))`
        );
    }
    return { data: toCurrentData(Model, workbook([sheet("contacts", "Contacts", matrixToCells(matrix))])) };
}

export async function benchmark({ Model }, { data }) {
    const model = new Model(data);
    model.leaveSession();
}
