// Deterministic dataset builders shared by the benchmark scenarios.
//
// Raw workbooks are written in a stable, simple format (version 18.5.1, string
// cells) and normalized to the engine's current format with `toCurrentData`, so
// the measured region never pays for data migrations and scenarios keep working
// across engine versions.

const RAW_VERSION = "18.5.1";

/** Seeded PRNG (mulberry32): identical data on every run and every target. */
export function makeRandom(seed = 42) {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
        pick: (array) => array[Math.floor(next() * array.length)],
    };
}

export function colName(index) {
    let name = "";
    index += 1;
    while (index > 0) {
        const rem = (index - 1) % 26;
        name = String.fromCharCode(65 + rem) + name;
        index = Math.floor((index - 1) / 26);
    }
    return name;
}

/** 0-based col/row to "A1" notation */
export function xc(col, row) {
    return colName(col) + (row + 1);
}

/** "A1:B2" -> zone, 0-based */
export function toZone(range) {
    const [start, end = start] = range.split(":");
    const parse = (ref) => {
        const [, letters, digits] = ref.match(/^([A-Z]+)(\d+)$/);
        let col = 0;
        for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
        return { col: col - 1, row: parseInt(digits, 10) - 1 };
    };
    const a = parse(start);
    const b = parse(end);
    return {
        left: Math.min(a.col, b.col),
        right: Math.max(a.col, b.col),
        top: Math.min(a.row, b.row),
        bottom: Math.max(a.row, b.row),
    };
}

export const REGIONS = ["North", "South", "East", "West", "Central"];
export const CATEGORIES = ["Furniture", "Office Supplies", "Technology", "Software", "Services"];
export const PRODUCTS = Array.from({ length: 60 }, (_, i) => `Product ${String(i + 1).padStart(3, "0")}`);
export const SALESPEOPLE = Array.from({ length: 40 }, (_, i) => `Rep ${String(i + 1).padStart(2, "0")}`);
const FIRST_NAMES = ["james", "mary", "robert", "patricia", "john", "jennifer", "michael", "linda", "david", "elizabeth", "william", "barbara", "richard", "susan", "joseph", "jessica", "thomas", "sarah", "charles", "karen"];
const LAST_NAMES = ["smith", "johnson", "williams", "brown", "jones", "garcia", "miller", "davis", "rodriguez", "martinez", "hernandez", "lopez", "gonzalez", "wilson", "anderson", "thomas", "taylor", "moore", "jackson", "martin"];

export const SALES_HEADER = ["Order ID", "Date", "Region", "Salesperson", "Product", "Category", "Quantity", "Unit Price", "Revenue"];
/** Column letters of the sales table, for readability in formulas */
export const SALES_COLS = { id: "A", date: "B", region: "C", rep: "D", product: "E", category: "F", qty: "G", price: "H", revenue: "I" };

/**
 * Typical "sales export" table: one header row and `rows` data rows, the
 * revenue column being a formula. Dates are serial numbers over 2 years.
 */
export function salesMatrix(rows, { seed = 1, revenueFormula = true } = {}) {
    const rnd = makeRandom(seed);
    const matrix = [SALES_HEADER];
    for (let i = 0; i < rows; i++) {
        const r = i + 2; // 1-based spreadsheet row
        matrix.push([
            `ORD-${String(100000 + i)}`,
            String(45292 + rnd.int(0, 729)), // 2024-01-01 .. 2025-12-30
            rnd.pick(REGIONS),
            rnd.pick(SALESPEOPLE),
            rnd.pick(PRODUCTS),
            rnd.pick(CATEGORIES),
            String(rnd.int(1, 50)),
            (rnd.int(500, 50000) / 100).toFixed(2),
            revenueFormula ? `=G${r}*H${r}` : String(rnd.int(10, 5000)),
        ]);
    }
    return matrix;
}

/** Customer contact list, mostly text */
export function contactsMatrix(rows, { seed = 2 } = {}) {
    const rnd = makeRandom(seed);
    const matrix = [["First name", "Last name", "Email", "Phone", "City", "Signup date"]];
    for (let i = 0; i < rows; i++) {
        const first = rnd.pick(FIRST_NAMES);
        const last = rnd.pick(LAST_NAMES);
        matrix.push([
            `  ${first}`,
            `${last} `,
            `${first}.${last}${rnd.int(1, 999)}@example.com`,
            `+1 (${rnd.int(200, 999)}) ${rnd.int(200, 999)}-${rnd.int(1000, 9999)}`,
            rnd.pick(["new york", "los angeles", "chicago", "houston", "phoenix", "brussels", "paris"]),
            String(43000 + rnd.int(0, 2500)),
        ]);
    }
    return matrix;
}

/** Converts a matrix of strings (undefined = empty) into raw cells */
export function matrixToCells(matrix, { col: startCol = 0, row: startRow = 0 } = {}, cells = {}) {
    for (let r = 0; r < matrix.length; r++) {
        const line = matrix[r];
        for (let c = 0; c < line.length; c++) {
            if (line[c] !== undefined && line[c] !== "") {
                cells[xc(startCol + c, startRow + r)] = line[c];
            }
        }
    }
    return cells;
}

export function sheet(id, name, cells, { cols = 26, rows = 100, ...rest } = {}) {
    let maxCol = cols - 1;
    let maxRow = rows - 1;
    for (const ref in cells) {
        const { left, top } = toZone(ref);
        maxCol = Math.max(maxCol, left);
        maxRow = Math.max(maxRow, top);
    }
    return { id, name, colNumber: maxCol + 1, rowNumber: maxRow + 1, cells, ...rest };
}

export function workbook(sheets, extra = {}) {
    return { version: RAW_VERSION, sheets, ...extra };
}

/**
 * Loads raw data in a throw-away model, lets `prepare` enrich it through
 * commands (styles, tables, charts, ...) and returns the exported data, in the
 * engine's current format.
 */
export function toCurrentData(Model, rawData, prepare) {
    const model = new Model(rawData);
    if (prepare) prepare(model);
    return model.exportData();
}

/** Builds the model in setup so that only the user interaction is measured. */
export function makeModel(Model, rawData, prepare) {
    const model = new Model(rawData);
    if (prepare) prepare(model);
    return model;
}
