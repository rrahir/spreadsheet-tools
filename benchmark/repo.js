import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getOdooSpreadsheetRepoPath() {
    if (process.env.SPREADSHEET_REPO_PATH) {
        return path.resolve(process.env.SPREADSHEET_REPO_PATH);
    }
    return path.resolve(__dirname, "../../o-spreadsheet");
}

export function buildPath() {
    return path.join(getOdooSpreadsheetRepoPath(), "dist", "o_spreadsheet.esm.js");
}

export function resolveSha(ref = "HEAD") {
    return execSync(`git rev-parse --short=10 ${ref}`, {
        cwd: getOdooSpreadsheetRepoPath(),
        stdio: ["ignore", "pipe", "pipe"],
    }).toString().trim();
}

/**
 * Returns the ref to check out to restore the repo to its current state:
 * the branch name when on a branch, or the commit sha when in detached HEAD.
 */
export function getCurrentRef() {
    const branch = execSync("git symbolic-ref --short -q HEAD || true", {
        cwd: getOdooSpreadsheetRepoPath(),
        stdio: ["ignore", "pipe", "pipe"],
    }).toString().trim();
    return branch || resolveSha("HEAD");
}
