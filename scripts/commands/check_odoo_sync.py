import configparser
import json
import os
import re
import subprocess
import sys

from helpers import git, print_msg
from shared import get_spreadsheet_branch, get_version_info
from utils import pushd

# We assume that while developing in o-spreadsheet, a dev makes a branch in odoo
# and/or enterprise with the required changes, and that the branch names are synced.
#
# The o-spreadsheet PRs merged in master since the last release are not yet in odoo/enterprise
# master, nor are their companion changes in odoo/enterprise. Those changes must be present
# in our local odoo/enterprise branch (e.g. master-truc-rar) as well.
#
# 1. find the last release ([REL] commit) shared by the current branch and its base (only if the base is master)
# 2. find the o-spreadsheet PRs (closes odoo/o-spreadsheet#123) merged in base since that release
# 3. find the head branches of those PRs
# 4. look for branches with the same names in the odoo/enterprise dev repositories
# 5. if their PR is still open, keep their commits that do not only touch the lib files
# 6. check that those commits are present in the local odoo/enterprise branch (and apply them if asked)

CLOSES_RE = re.compile(r"closes odoo/o-spreadsheet#(\d+)", re.IGNORECASE)
LIB_FILES = {
    "o_spreadsheet.js",
    "o_spreadsheet.xml",
    "o_spreadsheet.css",
    "o_spreadsheet.scss",
    "o_spreadsheet_variables.scss",
}
ODOO_REPOS = {"odoo": "odoo/odoo", "enterprise": "odoo/enterprise"}


def get_pr_numbers(config, old, new) -> "list[str]":
    """o-spreadsheet PRs merged between old and new"""
    with pushd(config["spreadsheet"]["repo_path"]):
        log = git("log", "--format=%B", f"{old}..{new}")
    return sorted(set(CLOSES_RE.findall(log)), key=int)


def get_unreleased_pr_numbers(config, branch, base) -> "list[str]":
    """PRs merged in base since the last release shared by base and the dev branch"""
    with pushd(config["spreadsheet"]["repo_path"]):
        remote = config["spreadsheet"]["remote"]
        git("fetch", "-q", remote, base)
        base_ref = f"{remote}/{base}"
        merge_base = git("merge-base", branch, base_ref)
        last_release = git("log", "-1", "--format=%H", "--grep", "^\\[REL\\]", merge_base)
        if not last_release:
            sys.exit(f"No common release found between {branch} and {base_ref}")
    return get_pr_numbers(config, last_release, base_ref)


def get_pr_branches(pr_numbers) -> "dict[str, str]":
    branches = {}
    for number in pr_numbers:
        try:
            result = subprocess.check_output(
                ["gh", "pr", "view", number, "--repo", "odoo/o-spreadsheet", "--json", "headRefName"]
            )
            branches[json.loads(result)["headRefName"]] = number
        except subprocess.CalledProcessError:
            print_msg(f"Could not fetch odoo/o-spreadsheet#{number}", "WARNING")
    return branches


def get_existing_dev_branches(remote_dev, branches) -> "list[str]":
    if not branches:
        return []
    output = git("ls-remote", "--heads", remote_dev, *branches)
    return [line.split("refs/heads/", 1)[1] for line in output.splitlines() if line]


def get_open_pr_url(repo, branch):
    result = subprocess.check_output(
        ["gh", "pr", "list", "--repo", repo, "--head", branch, "--state", "open", "--json", "url"]
    )
    prs = json.loads(result)
    return prs[0]["url"] if prs else None


def is_lib_only_commit(sha) -> bool:
    files = git("diff-tree", "--no-commit-id", "--name-only", "-r", sha).splitlines()
    return all(os.path.basename(f) in LIB_FILES for f in files)


def get_missing_commits(local_branch, dev_ref, base_ref) -> "list[tuple[str, str]]":
    """Commits of dev_ref (since base_ref) that are not in local_branch, oldest first.

    Commits are compared by patch-id (git cherry) and fallback on the commit subject,
    since they may have been rebased/amended with conflicts.
    """
    if not git("branch", "--list", local_branch):
        return [
            (sha, git("log", "-1", "--format=%s", sha))
            for sha in git("rev-list", "--reverse", f"{base_ref}..{dev_ref}").splitlines()
            if not is_lib_only_commit(sha)
        ]
    local_subjects = set(git("log", "--format=%s", f"{base_ref}..{local_branch}").splitlines())
    missing = []
    for line in git("cherry", local_branch, dev_ref, base_ref).splitlines():
        status, sha = line.split()
        if status == "-" or is_lib_only_commit(sha):
            continue
        subject = git("log", "-1", "--format=%s", sha)
        if subject not in local_subjects:
            missing.append((sha, subject))
    return missing


def find_repo_missing_commits(config, repo, local_branch, base, pr_branches):
    """[(dev_branch, pr_url, [(sha, subject)])] for the open dev branches of repo"""
    remote = config[repo]["remote"]
    remote_dev = config[repo]["remote-dev"]
    result = []
    with pushd(config[repo]["repo_path"]):
        dev_branches = get_existing_dev_branches(remote_dev, list(pr_branches))
        if not dev_branches:
            return result
        git("fetch", "-q", remote, base)
        for dev_branch in dev_branches:
            url = get_open_pr_url(ODOO_REPOS[repo], dev_branch)
            if not url:
                continue
            git("fetch", "-q", remote_dev, dev_branch)
            commits = get_missing_commits(local_branch, f"{remote_dev}/{dev_branch}", f"{remote}/{base}")
            if commits:
                result.append((dev_branch, url, commits))
    return result


def find_missing_commits(config, local_branch, base, pr_numbers) -> dict:
    """{repo: [(dev_branch, pr_url, [(sha, subject)])]} for the repos with missing commits"""
    pr_branches = get_pr_branches(pr_numbers)
    pr_branches.pop(local_branch, None)
    missing = {}
    for repo in ODOO_REPOS:
        repo_missing = find_repo_missing_commits(config, repo, local_branch, base, pr_branches)
        if repo_missing:
            missing[repo] = repo_missing
    return missing


def print_missing_commits(missing, local_branch):
    for repo, dev_branches in missing.items():
        print_msg(f"\n--- {repo} ({local_branch}) ---", "HEADER")
        for dev_branch, url, commits in dev_branches:
            print_msg(f"{dev_branch} <{url}>", "FAIL")
            for sha, subject in commits:
                print(f"\t{sha[:10]} {subject}")


def get_open_pr_urls(missing) -> "list[str]":
    """urls of the odoo/enterprise dev PRs whose commits were applied"""
    return [url for dev_branches in missing.values() for _, url, _ in dev_branches]


def print_cherry_pick_plan(config, plan, local_branch, base, started_repos):
    """plan: [(repo, sha, subject)] still to cherry-pick, in order"""
    print_msg("\nRemaining cherry-picks:", "WARNING")
    for repo in dict.fromkeys(repo for repo, _, _ in plan):
        shas = [sha for r, sha, _ in plan if r == repo]
        print_msg(f"\n--- {repo} ({config[repo]['repo_path']}) ---", "HEADER")
        for r, sha, subject in plan:
            if r == repo:
                print(f"\t{sha[:10]} {subject}")
        if repo not in started_repos:
            if git_branch_exists(config, repo, local_branch):
                print(f"\tgit checkout {local_branch}")
            else:
                print(f"\tgit checkout -b {local_branch} {config[repo]['remote']}/{base}")
        print(f"\tgit cherry-pick {' '.join(sha[:10] for sha in shas)}")


def git_branch_exists(config, repo, branch) -> bool:
    with pushd(config[repo]["repo_path"]):
        return bool(git("branch", "--list", branch))


def apply_missing_commits(config, missing, local_branch, base, hint=""):
    """Cherry-pick the missing commits on local_branch, which is created from base if needed.
    The repositories are left on local_branch.
    On conflict, waits for the user to resolve it and goes on with the next commits. If the user
    quits, prints everything that remains to cherry-pick (and the hint) and exits.
    """
    for repo in missing:
        with pushd(config[repo]["repo_path"]):
            if git("status", "--porcelain", "--untracked-files=no"):
                sys.exit(f"You have uncommitted changes in {repo}. Please fix it!")

    plan = [
        (repo, sha, subject)
        for repo, dev_branches in missing.items()
        for _, _, commits in dev_branches
        for sha, subject in commits
    ]
    started_repos = set()
    for index, (repo, sha, subject) in enumerate(plan):
        with pushd(config[repo]["repo_path"]):
            if repo not in started_repos:
                started_repos.add(repo)
                if git("branch", "--list", local_branch):
                    git("checkout", "-q", local_branch)
                else:
                    git("checkout", "-q", "-b", local_branch, f"{config[repo]['remote']}/{base}")
            print(f"{repo}: cherry-pick {sha[:10]} {subject}")
            try:
                subprocess.check_output(["git", "cherry-pick", sha], stderr=subprocess.STDOUT)
            except subprocess.CalledProcessError:
                print_msg(
                    f"\nConflict while cherry-picking {sha[:10]} {subject}\n"
                    f"in {repo} ({config[repo]['repo_path']}) on {local_branch}.", "FAIL"
                )
                # if sys.stdin.isatty() and wait_conflict_resolution(config[repo]["repo_path"]):
                #     continue
                # print_msg("Resolve it and run `git cherry-pick --continue`.", "FAIL")
                if plan[index + 1:]:
                    print_cherry_pick_plan(config, plan[index + 1:], local_branch, base, started_repos)
                if hint:
                    print_msg(f"\n{hint}", "WARNING")
                sys.exit(1)


def sync_odoo_branches(config, local_branch, base, pr_numbers, apply=False) -> bool:
    """Reports (and applies if asked) the commits of the odoo/enterprise dev branches related
    to pr_numbers that are missing in the local odoo/enterprise branches named local_branch.
    Returns True if nothing is missing anymore.
    """
    missing = find_missing_commits(config, local_branch, base, pr_numbers)
    if not missing:
        return True
    print_missing_commits(missing, local_branch)
    if not apply:
        return False
    apply_missing_commits(config, missing, local_branch, base)
    return True


def get_branch_info(config):
    local_branch = get_spreadsheet_branch(config)
    [_, base, _, _, _] = get_version_info(local_branch)
    return local_branch, base


def check_odoo_sync(config: configparser.ConfigParser, apply=False):
    print("\n=== %s ODOO SYNC ===\n" % ("APPLY" if apply else "CHECK"))
    local_branch, base = get_branch_info(config)
    if base != "master":
        sys.exit(f"Branch {local_branch} is not based on master. Nothing to check.")

    pr_numbers = get_unreleased_pr_numbers(config, local_branch, base)
    if sync_odoo_branches(config, local_branch, base, pr_numbers, apply):
        print_msg(f"\nOdoo and Enterprise branches {local_branch} are in sync.", "OKGREEN")
    else:
        print_msg("\nSome commits are missing. Run `sp_tool sync-odoo` to apply them.", "FAIL")
        sys.exit(1)


def warn_odoo_sync(config: configparser.ConfigParser):
    """Non-blocking check, used by the build and push commands"""
    local_branch, base = get_branch_info(config)
    if base != "master":
        return
    pr_numbers = get_unreleased_pr_numbers(config, local_branch, base)
    if not sync_odoo_branches(config, local_branch, base, pr_numbers):
        print_msg(
            "\nSome odoo/enterprise commits are missing. Run `sp_tool sync-odoo` to apply them.\n", "WARNING"
        )
