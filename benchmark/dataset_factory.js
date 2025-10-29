// Dataset generation functions for benchmarking

function computeFormulaCells(cols, rows) {
    const cells = {};
    for (let row = 4; row <= rows; row++) {
        cells[`A${row}`] = row.toString();
        for (let col = 1; col < cols; col++) {
            const colLetter = _getColumnLetter(col);
            const prev = _getColumnLetter(col - 1);
            cells[colLetter + row] = `=${prev}${row}+1`;
        }
    }
    const letter = _getColumnLetter(cols);
    const nextLetter = _getColumnLetter(cols + 1);
    for (let i = 3; i < cols; i++) {
        cells[nextLetter + i] = `=SUM(A${i}:${letter}${i})`;
    }
    return cells;
}

function computeArrayFormulaCells(cols, rows) {
    const cells = {};
    const initRow = 4;
    for (let row = initRow; row <= rows; row++) {
        cells[`A${row}`] = { content: row.toString() };
    }
    for (let col = 1; col < cols; col++) {
        const colLetter = _getColumnLetter(col);
        const prev = _getColumnLetter(col - 1);
        cells[colLetter + initRow] = {
            content: `=transpose(transpose(${prev}${initRow}:${prev}${rows}))`,
        };
    }
    return cells;
}

function computeVectorizedFormulaCells(cols, rows) {
    const cells = {};
    const initRow = 4;
    for (let row = initRow; row <= rows; row++) {
        cells[`A${row}`] = { content: row.toString() };
    }
    for (let col = 1; col < cols; col++) {
        const colLetter = _getColumnLetter(col);
        const prev = _getColumnLetter(col - 1);
        cells[colLetter + initRow] = {
            content: `=${prev}${initRow}:${prev}${rows}+1`,
        };
    }
    const letter = _getColumnLetter(cols);
    const nextLetter = _getColumnLetter(cols + 1);
    for (let i = 3; i < cols; i++) {
        cells[nextLetter + i] = {
            content: `=SUM(A${i}:${letter}${i})`,
        };
    }
    return cells;
}

function computeNumberCells(cols, rows, type = "numbers") {
    const cells = {};
    for (let col = 0; col < cols; col++) {
        const letter = _getColumnLetter(col);
        for (let index = 1; index < rows - 1; index++) {
            switch (type) {
                case "numbers":
                    cells[letter + index] = { content: `${col + index}` };
                    break;
                case "floats":
                    cells[letter + index] = { content: `${col + index}.123` };
                    break;
                case "longFloats":
                    cells[letter + index] = { content: `${col + index}.123456789123456` };
                    break;
            }
        }
    }
    return cells;
}

function computeStringCells(cols, rows) {
    const cells = {};
    for (let col = 0; col < cols; col++) {
        const letter = _getColumnLetter(col);
        for (let index = 1; index < rows; index++) {
            cells[letter + index] = { content: Math.random().toString(36).slice(2) };
        }
    }
    return cells;
}

function computeSplitVlookup(rows) {
    const cells = {};
    for (let row = 1; row < rows; row++) {
        cells["A" + row] = { content: `=SPLIT("1 2", " ")` };
        cells["C" + row] = { content: `=B${row}` };
        cells["D" + row] = { content: `=VLOOKUP("2",C1:C${rows},1)` };
        cells["F" + row] = { content: `=D${row}` };
    }
    return cells;
}

export function makeLargeDataset(cols, rows, sheetsInfo = ["formulas"]) {
    const sheets = [];
    let cells;
    for (let index = 0; index < sheetsInfo.length; index++) {
        switch (sheetsInfo[index]) {
            case "formulas":
                cells = computeFormulaCells(cols, rows);
                break;
            case "arrayFormulas":
                cells = computeArrayFormulaCells(cols, rows);
                break;
            case "vectorizedFormulas":
                cells = computeVectorizedFormulaCells(cols, rows);
                break;
            case "numbers":
            case "floats":
            case "longFloats":
                cells = computeNumberCells(cols, rows, sheetsInfo[0]);
                break;
            case "strings":
                cells = computeStringCells(cols, rows);
                break;
            case "splitVlookup":
                cells = computeSplitVlookup(rows);
                break;
        }
        sheets.push({
            name: `Sheet${index + 1}`,
            colNumber: cols,
            rowNumber: rows,
            cells,
        });
    }
    return {
        version: "18.5.1",
        sheets,
        borders: {},
    };
}

function _getColumnLetter(number) {
    return number !== -1
        ? _getColumnLetter(Math.floor(number / 26) - 1) + String.fromCharCode(65 + (number % 26))
        : "";
}
