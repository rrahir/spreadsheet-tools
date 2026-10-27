// Small wrappers around model commands, mirroring what the UI dispatches.

import { toZone } from "./data.js";

/**
 * Runs `fn` and emits its duration as a benchmark event. Event names must
 * only contain word characters, spaces and dots (see worker.js).
 */
export function measure(event, fn) {
    const start = performance.now();
    const result = fn();
    console.debug(`${event} ${performance.now() - start} ms`);
    return result;
}

/** Same as `measure`, but sums the durations of repeated calls. */
export function makeAccumulator(event) {
    let total = 0;
    return {
        run(fn) {
            const start = performance.now();
            const result = fn();
            total += performance.now() - start;
            return result;
        },
        flush() {
            console.debug(`${event} ${total} ms`);
        },
    };
}

export function assertSuccess(result, what) {
    // "NoChanges" is a harmless rejection (e.g. re-applying an existing style)
    if (result && result.isSuccessful === false && !result.reasons.every((r) => r === "NoChanges")) {
        throw new Error(`${what} failed: ${JSON.stringify(result.reasons)}`);
    }
    return result;
}

export function dispatch(model, type, payload) {
    return assertSuccess(model.dispatch(type, payload), type);
}

export function sheetIdByName(model, name) {
    return model.getters.getSheetIdByName(name);
}

export function setCell(model, sheetId, ref, content) {
    const { left: col, top: row } = toZone(ref);
    return dispatch(model, "UPDATE_CELL", { sheetId, col, row, content });
}

export function select(model, range) {
    const zone = toZone(range);
    model.selection.selectZone({ cell: { col: zone.left, row: zone.top }, zone });
}

export function rangeData(sheetId, range) {
    return { _sheetId: sheetId, _zone: toZone(range) };
}

/**
 * Reads what the grid needs to draw one screen of cells, the way the renderer
 * would: formatted text, computed style, borders and conditional format icons.
 */
export function readViewport(model, sheetId, { top = 0, left = 0, rows = 45, cols = 15 } = {}) {
    const getters = model.getters;
    let checksum = 0;
    for (let row = top; row < top + rows; row++) {
        if (getters.isRowHidden(sheetId, row)) continue;
        for (let col = left; col < left + cols; col++) {
            const position = { sheetId, col, row };
            const text = getters.getCellText(position, { showFormula: false });
            getters.getCellComputedStyle(position);
            getters.getCellComputedBorder(position);
            getters.getConditionalIcon(position);
            checksum += text.length;
        }
    }
    return checksum;
}

/**
 * Some features (clipboard, autofill...) are implemented in UI stores that
 * react to model commands. Instantiates them headlessly for `model`.
 */
export function attachStores({ stores }, model, storeNames) {
    const container = new stores.DependencyContainer();
    container.inject(stores.ModelStore, model);
    for (const name of storeNames) container.get(stores[name]);
    return container;
}
