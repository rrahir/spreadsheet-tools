import { execSync } from "child_process";
import fs from "fs";
import path from "path";


export function gc() {
    if (global.gc) {
        global.gc();
    } else {
        console.warn("No GC hook! Start Node.js with --expose-gc to enable forced garbage collection.");
    }
}

export function checkoutBranch(branch) {
    const oSpreadsheetPath = getOdooSpreadsheetRepoPath();
    execSync(`git checkout ${branch}`, { stdio: "inherit", cwd: oSpreadsheetPath });
    // execSync("npm run build", { stdio: "inherit", cwd: oSpreadsheetPath });
    execSync("npm run dist --workspaces", { stdio: "inherit", cwd: oSpreadsheetPath });
}

export function buildPath() {
    return path.join(getOdooSpreadsheetRepoPath(), "dist", "o-spreadsheet-engine.esm.js");
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
