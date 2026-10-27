/**
 * Two users edit the same 3k rows workbook at the same time: while one
 * types values and formatting, the other inserts and deletes rows and
 * columns, so that concurrent revisions must be transformed against each
 * other (operational transform) and re-applied on both sides.
 *
 * Stresses: the collaborative session (revision sending, acknowledgment,
 * transformation of concurrent commands, undo/redo of local revisions
 * before applying remote ones).
 */

import { makeRandom, matrixToCells, salesMatrix, sheet, toCurrentData, workbook } from "./lib/data.js";
import { dispatch } from "./lib/helpers.js";

const ROWS = 3000;
const ROUNDS = 12;

/**
 * In-memory server: accepts a revision only if it is based on the latest
 * one, and delivers messages to every client in order (FIFO).
 */
function makeServer() {
    const listeners = [];
    const queue = [];
    let serverRevisionId = undefined;
    let delivering = false;
    let holding = false;
    const flush = () => {
        if (delivering || holding) return;
        delivering = true;
        while (queue.length) {
            const message = queue.shift();
            for (const callback of listeners) callback(JSON.parse(JSON.stringify(message)));
        }
        delivering = false;
    };
    return {
        setInitialRevision(id) {
            serverRevisionId = id;
        },
        onNewMessage(id, callback) {
            listeners.push(callback);
        },
        leave() {},
        sendMessage(message) {
            const msg = JSON.parse(JSON.stringify(message));
            if (["REMOTE_REVISION", "REVISION_UNDONE", "REVISION_REDONE"].includes(msg.type)) {
                if (msg.serverRevisionId !== serverRevisionId) return; // rejected, the client resends later
                serverRevisionId = msg.nextRevisionId;
            }
            queue.push(msg);
            flush();
        },
        /** Messages sent during `fn` are only delivered once `fn` is over */
        concurrent(fn) {
            holding = true;
            fn();
            holding = false;
            flush();
        },
    };
}

export function setup({ Model }) {
    const data = toCurrentData(Model, workbook([sheet("sales", "Sales", matrixToCells(salesMatrix(ROWS)), { cols: 15 })]));
    const server = makeServer();
    server.setInitialRevision(data.revisionId);
    const alice = new Model(JSON.parse(JSON.stringify(data)), { transportService: server, client: { id: "alice", name: "Alice" } });
    const bob = new Model(JSON.parse(JSON.stringify(data)), { transportService: server, client: { id: "bob", name: "Bob" } });
    return { server, alice, bob };
}

export async function benchmark(engine, { server, alice, bob }) {
    const sheetId = "sales";
    const sheetName = "Sales";
    const rnd = makeRandom(43);
    for (let i = 0; i < ROUNDS; i++) {
        server.concurrent(() => {
            const row = rnd.int(1, ROWS - 100);
            dispatch(alice, "UPDATE_CELL", { sheetId, col: 6, row, content: String(100 + i) });
            dispatch(alice, "SET_FORMATTING", { sheetId, target: [{ left: 0, right: 8, top: row, bottom: row }], style: { fillColor: "#FFF2CC" } });
            if (i % 4 === 3) {
                dispatch(bob, "ADD_COLUMNS_ROWS", { sheetId, sheetName, dimension: "COL", base: 3, position: "after", quantity: 1 });
            } else if (i % 2) {
                dispatch(bob, "REMOVE_COLUMNS_ROWS", { sheetId, sheetName, dimension: "ROW", elements: [row - 1, row + 1] });
            } else {
                dispatch(bob, "ADD_COLUMNS_ROWS", { sheetId, sheetName, dimension: "ROW", base: row - 5, position: "before", quantity: 3 });
            }
        });
    }
    const shape = (model) => [model.getters.getNumberRows(sheetId), model.getters.getNumberCols(sheetId)].join("x");
    if (shape(alice) !== shape(bob)) {
        throw new Error(`clients are out of sync: ${shape(alice)} vs ${shape(bob)}`);
    }
}
