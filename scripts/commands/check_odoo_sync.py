import configparser
import json
import os
import re
import subprocess
import sys

from helpers import print_msg
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
# 6. check that those commits are present in the local odoo/enterprise branch

CLOSES_RE = re.compile(r"closes odoo/o-spreadsheet#(\d+)", re.IGNORECASE)
LIB_FILES = {
    "o_spreadsheet.js",
    "o_spreadsheet.xml",
    "o_spreadsheet.css",
    "o_spreadsheet.scss",
    "o_spreadsheet_variables.scss",
}
ODOO_REPOS = {"odoo": "odoo/odoo", "enterprise": "odoo/enterprise"}


def git(*args) -> str:
    return subprocess.check_output(["git", *args]).decode("utf-8").strip()


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
        log = git("log", "--format=%B", f"{last_release}..{base_ref}")
    return sorted(set(CLOSES_RE.findall(log)), key=int)


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
    """Commits of dev_ref (since base_ref) that are not in local_branch.

    Commits are compared by patch-id (git cherry) and fallback on the commit subject,
    since they may have been rebased/amended with conflicts.
    """
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


def check_repo(config, repo, local_branch, base, pr_branches) -> bool:
    remote = config[repo]["remote"]
    remote_dev = config[repo]["remote-dev"]
    all_synced = True
    with pushd(config[repo]["repo_path"]):
        dev_branches = get_existing_dev_branches(remote_dev, list(pr_branches))
        if not dev_branches:
            return True

        git("fetch", "-q", remote, base)
        base_ref = f"{remote}/{base}"
        has_local_branch = bool(git("branch", "--list", local_branch))

        for dev_branch in dev_branches:
            url = get_open_pr_url(ODOO_REPOS[repo], dev_branch)
            if not url:
                continue
            git("fetch", "-q", remote_dev, dev_branch)
            dev_ref = f"{remote_dev}/{dev_branch}"
            if not has_local_branch:
                commits = [
                    (sha, git("log", "-1", "--format=%s", sha))
                    for sha in git("rev-list", "--reverse", f"{base_ref}..{dev_ref}").splitlines()
                    if not is_lib_only_commit(sha)
                ]
            else:
                commits = get_missing_commits(local_branch, dev_ref, base_ref)

            if not commits:
                continue
            if all_synced:
                print_msg(f"\n--- {repo} ---", "HEADER")
            all_synced = False
            print_msg(f"{dev_branch} <{url}>", "FAIL")
            for sha, subject in commits:
                print(f"\t{sha[:10]} {subject}")

        if not has_local_branch and not all_synced:
            print_msg(f"Local branch {local_branch} does not exist in {repo}", "WARNING")
    return all_synced


def check_odoo_sync(config: configparser.ConfigParser):
    print("\n=== CHECK ODOO SYNC ===\n")
    local_branch = get_spreadsheet_branch(config)
    [_, base, _, _, _] = get_version_info(local_branch)
    if base != "master":
        sys.exit(f"Branch {local_branch} is not based on master. Nothing to check.")

    pr_branches = get_pr_branches(get_unreleased_pr_numbers(config, local_branch, base))
    pr_branches.pop(local_branch, None)

    results = [check_repo(config, repo, local_branch, base, pr_branches) for repo in ODOO_REPOS]
    if all(results):
        print_msg(f"\nOdoo and Enterprise branches {local_branch} are in sync.", "OKGREEN")
    else:
        print_msg("\nSome commits are missing. See above.", "FAIL")
        sys.exit(1)
