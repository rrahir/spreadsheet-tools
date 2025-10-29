import { execSync } from "child_process";
import fs from "fs";
import v8 from "v8";
import path from "path";

function saveHeapSnapshot(runNumber) {
    // Disabled for now, uncomment to enable heap snapshots
    // GC();
    // const snapshotsDir = path.resolve("snapshots");
    // if (!fs.existsSync(snapshotsDir)) {
    //     fs.mkdirSync(snapshotsDir);
    // }
    // const ts = new Date().toISOString().replace(/[:.]/g, "-");
    // const filename = path.join(snapshotsDir, `heap-${ts}-run${runNumber}.heapsnapshot`);
    // v8.writeHeapSnapshot(filename);
    // console.log(`Heap snapshot saved: ${filename}`);
}

function GC() {
    if (global.gc) {
        global.gc();
    }
}

export function checkoutBranch(branch) {
    const oSpreadsheetPath = getOdooSpreadsheetRepoPath();
    execSync(`git checkout ${branch}`, { stdio: "inherit", cwd: oSpreadsheetPath });
    execSync("npm run build", { stdio: "inherit", cwd: oSpreadsheetPath });
    execSync("npm run bundle:esm --workspaces", { stdio: "inherit", cwd: oSpreadsheetPath });
}

export function buildPath() {
    return path.join(getOdooSpreadsheetRepoPath(), "packages", "o-spreadsheet-engine", "build", "o-spreadsheet-engine.esm.js");
}

function getOdooSpreadsheetRepoPath() {
    const configPath = `${process.env.HOME}/.spConfig.ini`;
    const iniContent = fs.readFileSync(configPath, "utf-8");
    let repoPath = null;
    const spreadsheetSection = iniContent.match(/\[spreadsheet\]([\s\S]*?)(\n\[|$)/);
    if (spreadsheetSection) {
        const lines = spreadsheetSection[1].split(/\r?\n/);
        for (const line of lines) {
            const m = line.match(/repo_path\s*=\s*(.*)/);
            if (m) {
                repoPath = m[1].trim();
                break;
            }
        }
    }
    if (!repoPath) {
        throw new Error("Could not find repo_path in [spreadsheet] section of config");
    }
    return repoPath;
}
