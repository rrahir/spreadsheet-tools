/**
 * Aggregation + table formatting for the autoperf `profile` / `profile-memory`
 * commands. The table formatting is shared; only the unit differs (ms vs MB)
 * and the metric (CPU self-time vs heap selfSize).
 */

import path from "path";

const TOP_N = 30;

function frameKey(callFrame) {
    const url = callFrame.url || "";
    const file = url ? path.basename(url) : "(native)";
    const line = (callFrame.lineNumber ?? -1) + 1;
    const name = callFrame.functionName || "(anonymous)";
    return `${name} @ ${file}:${line}`;
}

/**
 * Aggregate CPU self-time (ms) by function from a .cpuprofile.
 *
 * Walks `samples` + `timeDeltas`, attributing each sample's delta (microseconds)
 * to the call frame of the sampled node. Self-time only: no inclusive/subtree
 * accounting, which avoids recursion double-counting.
 *
 * Returns { totals: Map<key, ms>, total: ms }.
 */
export function aggregateCpu(profile) {
    const nodesById = new Map();
    for (const node of profile.nodes) nodesById.set(node.id, node);

    const totals = new Map();
    let total = 0;
    const { samples, timeDeltas } = profile;
    for (let i = 0; i < samples.length; i++) {
        const deltaUs = timeDeltas[i] || 0;
        const node = nodesById.get(samples[i]);
        if (!node) continue;
        const ms = deltaUs / 1000;
        const key = frameKey(node.callFrame);
        totals.set(key, (totals.get(key) || 0) + ms);
        total += ms;
    }
    return { totals, total };
}

/**
 * Aggregate heap allocation (bytes) by function from a sampling heap profile.
 *
 * Walks the `head` tree recursively, summing each node's `selfSize` grouped by
 * its call frame.
 *
 * Returns { totals: Map<key, bytes>, total: bytes }.
 */
export function aggregateMemory(profile) {
    const totals = new Map();
    let total = 0;
    const stack = [profile.head];
    while (stack.length) {
        const node = stack.pop();
        const selfSize = node.selfSize || 0;
        if (selfSize) {
            const key = frameKey(node.callFrame);
            totals.set(key, (totals.get(key) || 0) + selfSize);
            total += selfSize;
        }
        if (node.children) for (const child of node.children) stack.push(child);
    }
    return { totals, total };
}

/**
 * Print a ranked table to `out`.
 *   totals:   Map<key, value>
 *   total:    sum of all values (for percentages)
 *   format:   (value) => string   formatted, unit-suffixed value column
 *   header:   total line, e.g. "total CPU self-time: 27845.1ms"
 */
export function printTable({ totals, total, format, header, out = console.log }) {
    out(header);
    const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N);
    for (const [key, value] of rows) {
        const pct = total ? (value / total) * 100 : 0;
        out(`  ${pct.toFixed(1).padStart(5)}%  ${format(value).padStart(11)}  ${key}`);
    }
}

export function formatMs(ms) {
    return `${ms.toFixed(1)}ms`;
}

export function formatMb(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
