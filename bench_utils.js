// Statistical and general utility functions for benchmarking

export function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stddev(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

export function confidenceInterval(arr, confidence = 0.95) {
    const m = mean(arr);
    const sd = stddev(arr);
    const n = arr.length;
    const z = 1.96; // 95% CI
    const margin = (z * sd) / Math.sqrt(n);
    return [m - margin, m + margin];
}

export function _getColumnLetter(number) {
    return number !== -1
        ? _getColumnLetter(Math.floor(number / 26) - 1) + String.fromCharCode(65 + (number % 26))
        : "";
}
