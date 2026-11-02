/**
 * Open a collaborative spreadsheet whose last snapshot is followed by 1000
 * revisions (cell edits, formatting, row insertions...) that must be
 * replayed on load, like in Odoo when many users edited since the last
 * snapshot.
 *
 * Stresses: collaborative session replay of remote revisions
 * ("Replayed N commands in" event), command handling without UI.
 */

import { makeRandom, matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";
import { dispatch } from "./lib/helpers.js";

const REVISIONS = 1000;

/** Transport acknowledging every message immediately, and recording revisions */
function recordingTransport() {
    const listeners = [];
    const revisions = [];
    return {
        revisions,
        sendMessage(message) {
            const copy = JSON.parse(JSON.stringify(message));
            if (copy.type === "REMOTE_REVISION") revisions.push(copy);
            for (const callback of listeners) callback(copy);
        },
        onNewMessage(id, callback) {
            listeners.push(callback);
        },
        leave() {},
    };
}

export function setup({ Model }) {
    const data = toCurrentData(Model, workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(5000)))]));
    const transportService = recordingTransport();
    const model = new Model(JSON.parse(JSON.stringify(data)), {
        transportService,
        client: { id: "recorder", name: "Recorder" },
    });
    const rnd = makeRandom(11);
    const sheetId = "sales";
    for (let i = 0; i < REVISIONS; i++) {
        const kind = rnd.next();
        const col = rnd.int(0, 8);
        const row = rnd.int(1, 5000);
        if (kind < 0.8) {
            dispatch(model, "UPDATE_CELL", { sheetId, col: 6, row, content: String(100 + i) });
        } else if (kind < 0.92) {
            dispatch(model, "SET_FORMATTING", { sheetId, target: [{ left: col, right: col, top: row, bottom: row + 5 }], style: { bold: true } });
        } else if (kind < 0.97) {
            dispatch(model, "ADD_COLUMNS_ROWS", { sheetId, sheetName: "Sales", dimension: "ROW", base: row, position: "after", quantity: 1 });
        } else {
            dispatch(model, "REMOVE_COLUMNS_ROWS", { sheetId, sheetName: "Sales", dimension: "ROW", elements: [row] });
        }
    }
    return { data, initialMessages: transportService.revisions };
}

export async function benchmark({ Model }, { data, initialMessages }) {
    const model = new Model(data, {}, initialMessages);
    model.leaveSession();
}
