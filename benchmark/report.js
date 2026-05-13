/**
 * Analyze and pretty-print benchmark samples.
 *
 *   samples: { [label]: { [event]: number[] } }     (as returned by runBenchmark)
 *
 * - Events whose best mean < 5 ms are filtered (noise).
 * - Per-label "vs prev" and "vs baseline" percentages are computed in label order.
 */

function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stddev(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}
function stderr(arr) {
    return arr.length <= 1 ? 0 : stddev(arr) / Math.sqrt(arr.length);
}
function speedupPercent(ref, m) {
    return ref ? ((ref - m) / ref) * 100 : null;
}

export function analyze(samples) {
    const labels = Object.keys(samples);
    const allEvents = new Set();
    for (const label of labels) {
        for (const event of Object.keys(samples[label])) allEvents.add(event);
    }

    const analysis = [];
    for (const event of allEvents) {
        const statsByLabel = {};
        let bestMean = Infinity;
        let bestLabel = null;
        for (const label of labels) {
            const arr = samples[label][event];
            if (!arr || arr.length === 0) continue;
            const m = mean(arr);
            statsByLabel[label] = { mean: m, stderr: stderr(arr), n: arr.length };
            if (m < bestMean) { bestMean = m; bestLabel = label; }
        }
        if (bestMean < 5) continue;

        const presentLabels = labels.filter((l) => statsByLabel[l]);
        const baseline = presentLabels[0];
        const labelStats = presentLabels.map((label, i) => {
            const s = statsByLabel[label];
            const stat = {
                label,
                mean: s.mean,
                stderr: s.stderr,
                n: s.n,
                isBest: label === bestLabel,
                pctVsPrev: i > 0 ? speedupPercent(statsByLabel[presentLabels[i - 1]].mean, s.mean) : null,
                pctVsBaseline: i > 1 ? speedupPercent(statsByLabel[baseline].mean, s.mean) : null,
                verdict: null,
            };
            if (i > 0) {
                const prev = statsByLabel[presentLabels[i - 1]];
                const delta = s.mean - prev.mean;
                const combinedStderr = Math.sqrt(prev.stderr ** 2 + s.stderr ** 2);
                const ratio = combinedStderr > 0
                    ? delta / combinedStderr
                    : (delta === 0 ? 0 : Infinity * Math.sign(delta));
                let verdictLabel;
                if (Math.abs(ratio) < 2) {
                    verdictLabel = "⚫";
                } else if (delta > 0) {
                    verdictLabel = "🔴";
                } else {
                    verdictLabel = "🟢";
                }
                stat.verdict = { delta, combinedStderr, ratio, label: verdictLabel };
            }
            return stat;
        });
        analysis.push({ event, labelStats });
    }
    return analysis;
}

export function printReport(samples, { color = process.stdout.isTTY, out = console.log, eventFilter = null } = {}) {
    const analysis = analyze(samples);
    const entries = eventFilter ? analysis.filter(eventFilter) : analysis;
    const labels = Object.keys(samples);
    const maxLabelLen = Math.max(...labels.map((l) => l.length));
    const green = color ? "\x1b[32m" : "";
    const red = color ? "\x1b[31m" : "";
    const reset = color ? "\x1b[0m" : "";

    const fmtPct = (caption, pct) => {
        if (pct === null) return "";
        const c = pct >= 0 ? green : red;
        const sign = pct >= 0 ? "-" : "+";
        return `${caption}: ${c}${sign}${Math.abs(pct).toFixed(0)}%${reset}`;
    };

    for (const { event, labelStats } of entries) {
        out(`\n${event}`);
        const rows = labelStats.map((s) => {
            const labelCol = `${s.label}:`.padEnd(maxLabelLen + 3, " ");
            const meanStr = s.isBest ? `${green}${s.mean.toFixed(2)} ms${reset}` : `${s.mean.toFixed(2)} ms`;
            const visibleMean = `${s.mean.toFixed(2)} ms`;
            const prefix = `  ${labelCol}Mean: ${meanStr}, StdErr: ${s.stderr.toFixed(2)} ms`;
            const visibleLen = `  ${labelCol}Mean: ${visibleMean}, StdErr: ${s.stderr.toFixed(2)} ms`.length;
            return { s, prefix, visibleLen };
        });
        const maxVisibleLen = Math.max(...rows.map((r) => r.visibleLen));
        for (const { s, prefix, visibleLen } of rows) {
            const parts = [];
            if (s.pctVsPrev !== null) parts.push(fmtPct("vs prev", s.pctVsPrev));
            if (s.pctVsBaseline !== null) parts.push(fmtPct("vs baseline", s.pctVsBaseline));
            const pct = parts.length ? `${parts.join(", ")}` : "";
            let logLine = prefix;
            if (s.verdict) {
                logLine += " ".repeat(maxVisibleLen - visibleLen);
                const v = s.verdict;
                const c = v.label === "🟢" ? green : v.label === "🔴" ? red : "";
                const ratioStr = Number.isFinite(v.ratio) ? `${v.ratio.toFixed(1)}x` : "∞";
                const deltaSign = v.delta >= 0 ? "+" : "-";
                logLine += ` → ${v.label} (${pct}, Δ=${deltaSign}${Math.abs(v.delta).toFixed(2)} ms, combined StdErr=${v.combinedStderr.toFixed(2)} ms, |Δ|/SE=${ratioStr}; n=${s.n})`
            }
            out(logLine);
        }
    }
    // legend
    out("\nLegend:");
    out(`  ⚫: no measurable change |Δ|/SE < 2`);
    out(`  🔴: slower Δ > 0 and |Δ|/SE >= 2`);
    out(`  🟢: faster Δ < 0 and |Δ|/SE >= 2`);
}
