/**
 * Save a business workbook (15k rows table with formulas and formats, a
 * table, conditional formats, data validation, a pivot and charts): export
 * of the full JSON snapshot, as done when a snapshot is taken in a
 * collaborative session.
 *
 * Stresses: every plugin's export (cells and formula serialization, style /
 * format / border zones compaction, ...).
 */

import { makeModel } from "./lib/data.js";
import { businessWorkbook } from "./lib/business_workbook.js";

export function setup({ Model }) {
    const { raw, prepare } = businessWorkbook(15000);
    return { model: makeModel(Model, raw, prepare) };
}

export async function benchmark(engine, { model }) {
    const data = model.exportData();
    // serialization is part of saving
    JSON.stringify(data);
}
