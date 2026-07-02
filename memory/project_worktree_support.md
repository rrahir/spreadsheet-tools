---
name: project-worktree-support
description: In-progress implementation of git worktree support for sp_tool — auto-detect worktrees instead of git checkout branch-switching
metadata:
  type: project
---

Implementation of worktree auto-detection across the tool so that when a git worktree already has a version branch checked out, the tool uses that worktree directory directly instead of doing `git checkout <version>` in the main repo.

**Why:** With worktrees each version lives in its own directory (e.g. `/repos/odoo-saas-19.4/`). The current tool does `git checkout saas-19.4` in a single `repo_path`, which interrupts work and is wrong when worktrees are in use.

**How to apply:** When resuming, apply all changes below from scratch. All files were reverted to their original state by a linter mid-session — none of the changes are currently in the repo.

---

## Design

**Auto-detect, no config changes.** `git worktree list --porcelain` is run from `repo_path` to find the worktree path for a given branch. Falls back to original checkout behavior if no worktree is found.

**Two-level resolution in `checkout()`:**
1. Exact match: `find_worktree(exec_path, branch)` → if found, return it immediately, skip all git commands.
2. Base version match: `find_worktree(exec_path, version)` → if found, create the new branch inside that worktree instead of the main repo. Used when `branch` is a new working branch (e.g. `saas-19.4-spreadsheet-2307-xxxx-BI`).

---

## Changes required (all files currently at original state)

### `scripts/utils.py` — add `find_worktree`

Insert before `retry_cmd`:

```python
def find_worktree(repo_path, branch):
    """Return the path of the worktree that has `branch` checked out, or None."""
    try:
        output = subprocess.check_output(
            ["git", "worktree", "list", "--porcelain"],
            cwd=repo_path,
        ).decode("utf-8")
    except subprocess.CalledProcessError:
        return None
    current_path = None
    for line in output.splitlines():
        if line.startswith("worktree "):
            current_path = line[len("worktree "):]
        elif line.startswith("branch refs/heads/") and current_path:
            if line[len("branch refs/heads/"):] == branch:
                return current_path
    return None
```

### `scripts/helpers.py` — 3 changes

**1. Import `find_worktree`:**
```python
from utils import pushd, retry_cmd, find_worktree
```

**2. Rewrite `checkout()` to return effective path:**
```python
def checkout(exec_path, branch, force=False):
    worktree_path = find_worktree(exec_path, branch)
    if worktree_path:
        return worktree_path

    is_verbose = get_verbose()
    [_, version, _, _, _] = get_version_info(branch)
    effective_path = find_worktree(exec_path, version) or exec_path

    with pushd(effective_path):
        try:
            lingering_diff = subprocess.check_output(["git", "diff"]).decode("utf-8")
            if lingering_diff:
                if force:
                    subprocess.check_output(["git", "reset", "--hard", "HEAD"]).decode("utf-8")
                else:
                    print_msg("You have unstaged changes. Please fix it", "FAIL")
                    print_msg(f"Path:\n{effective_path}\n\n{lingering_diff}\n")
                    print_msg("You have unstaged changes. Please fix it!", "FAIL")
                    sys.exit(1)
            subprocess.check_output(["git", "checkout", branch])
        except subprocess.CalledProcessError as e:
            is_verbose and print("Branch not found.\nCreating new local branch...")
            is_verbose and print(f"Checkout base branch {version}")
            subprocess.check_output(["git", "checkout", version])
            subprocess.check_output(["git", "pull"])
            is_verbose and print(f"Create branch {branch}")
            subprocess.check_output(["git", "checkout", "-b", branch])

    return effective_path
```

**3. Change `run_build` and `copy_build` signatures** (accept path string, not config):
```python
def run_build(spreadsheet_path: str):
    with pushd(spreadsheet_path):
        ...

def copy_build(spreadsheet_path: str, lib_file_name: str, destination_path: str, stylesheet: str = "NO"):
    ...
    with pushd(os.path.join(spreadsheet_path, "build")):
        ...
```

### `scripts/commands/update.py` — use effective paths

Replace the per-version block starting at `repo_path = config[repo]["repo_path"]`:
- `repo_path` → `base_repo_path` (keep config lookup)
- Capture `effective_spreadsheet_path = checkout(spreadsheet_path, version)`
- Capture `effective_repo_path = checkout(base_repo_path, version, force=True)`
- Move `full_path = os.path.join(...)` to after the checkouts (use `effective_repo_path`)
- Replace `with pushd(repo_path)` → `with pushd(effective_repo_path)`
- Replace inner `with pushd(spreadsheet_path)` → `with pushd(effective_spreadsheet_path)`
- `reset(spreadsheet_path, ...)` → `reset(effective_spreadsheet_path, ...)`
- `reset(repo_path, ...)` → `reset(effective_repo_path, ...)`
- `get_commits(spreadsheet_path, ...)` → `get_commits(effective_spreadsheet_path, ...)`
- `checkout(repo_path, o_branch)` → `checkout(effective_repo_path, o_branch)`
- `run_build(config)` → `run_build(effective_spreadsheet_path)`
- `copy_build(config, ...)` → `copy_build(effective_spreadsheet_path, ...)`
- `make_PR(repo_path, ...)` → `make_PR(effective_repo_path, ...)`

### `scripts/commands/release.py` — use effective path

- `checkout(spreadsheet_path, version, force=True)` → `effective_spreadsheet_path = checkout(...)`
- `reset(spreadsheet_path, version)` → `reset(effective_spreadsheet_path, version)`
- `with pushd(spreadsheet_path)` → `with pushd(effective_spreadsheet_path)`
- `increment_package_version(spreadsheet_path, ...)` → `increment_package_version(effective_spreadsheet_path, ...)`
- `make_PR(spreadsheet_path, ...)` → `make_PR(effective_spreadsheet_path, ...)`

### `scripts/commands/push.py` — use effective path + new signatures

- `checkout(repo_path, spreadsheet_branch)` → `effective_repo_path = checkout(base_repo_path, spreadsheet_branch)`
- `full_path = os.path.join(effective_repo_path, rel_path)` (move after checkout)
- `run_build(config)` → `run_build(spreadsheet_path)`
- `copy_build(config, ...)` → `copy_build(spreadsheet_path, ...)`
- `with pushd(repo_path)` → `with pushd(effective_repo_path)`

### `scripts/commands/gh_pages.py` — new signatures

- `checkout(spreadsheet_path, "master")` → `effective_spreadsheet_path = checkout(...)`
- `run_build(config)` → `run_build(effective_spreadsheet_path)`
- `with pushd(os.path.join(config["spreadsheet"]["repo_path"], "build"))` → `with pushd(os.path.join(effective_spreadsheet_path, "build"))`

### `scripts/commands/build.py` — new signatures only

- `run_build(config)` → `run_build(spreadsheet_path)`
- `copy_build(config, ...)` → `copy_build(spreadsheet_path, ...)`
- Remove the wrapping `with pushd(spreadsheet_path):` (it was only there for run_build context, not needed now)
