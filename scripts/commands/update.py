import configparser
import os
from datetime import date
from uuid import uuid4

from contributors import CONTRIBUTORS
from helpers import (
    check_remote_alignment,
    checkout,
    commit_message,
    copy_build,
    enterprise_adapt_title,
    fetch_repositories,
    get_commits,
    get_odoo_prs,
    git,
    make_PR,
    odoo_commit_title,
    print_msg,
    reset,
    run_build,
)
from shared import spreadsheet_odoo_versions
from utils import get_o_spreadsheet_js_hash, pushd

from .check_odoo_sync import (
    apply_missing_commits,
    find_missing_commits,
    get_open_pr_urls,
    get_pr_numbers,
    print_missing_commits,
)


def update(config: configparser.ConfigParser, versions: list[str]):
    """ Following a release, updates the code of the lib to Odoo
        and creates a pull request to merge the changes.
        External dependencies are not bundled with it
    """

    check_remote_alignment()
    print("\n=== UPDATE ODOO ===\nThis may take a while ;-)\n")
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    fetch_repositories(config, versions)
    old_prs = []
    new_prs = []
    prs_to_close = []
    existing_prs = get_odoo_prs(config)
    today = date.today()
    d = f"{str(today.day).zfill(2)}{str(today.month).zfill(2)}"
    h = str(uuid4())[:4]

    for version in versions:
        [repo, version, rel_path, lib_file_name, stylesheet] = spreadsheet_odoo_versions[version]
        text = f"Processing version {version}"
        print(text)
        print("=" * len(text))
        if version in existing_prs:
            print(
                f"Branch {version} already has a pending PR on odoo/{repo}. Skipping...\n"
            )
            old_prs.append([version, existing_prs[version]])
            continue

        repo_path = config[repo]["repo_path"]
        full_path = os.path.join(repo_path, rel_path)
        o_branch = f"{version}-spreadsheet-{d}-{h}-BI"

        # checkout o-spreadsheet
        checkout(spreadsheet_path, version)
        reset(spreadsheet_path, version)

        # checkout Odoo (Community/Enterprise) on update branch
        checkout(repo_path, version, force=True)
        reset(repo_path, version)

        # build commit message - build/cp dist - push on remote
        with pushd(repo_path):
            full_file_path = os.path.join(full_path, "o_spreadsheet.js")
            spreadsheet_hash = version
            # check last commit on o-spreadsheet is a REL
            with pushd(spreadsheet_path):
                commit = git("log", "HEAD^..HEAD", "--pretty=format:%s")
                if not commit.startswith("[REL]"):
                    print_msg(
                        f"""The last commit on o-spreadsheet in version {version} is not a release.\n"""
                        """Defaulting on last [REL] commit...""", "WARNING"
                    )
                    spreadsheet_hash = git("log", "--pretty=format:%h", "-n", "1", "--grep", "\\[REL\\]")
                    # build the release, not the commits merged after it
                    git("checkout", "-q", spreadsheet_hash)

            # find all commits since last update
            odoo_hash = get_o_spreadsheet_js_hash(full_file_path)
            body = get_commits(spreadsheet_path, odoo_hash, spreadsheet_hash)
            if not body:
                print(
                    f"Branch {version} is up-to-date on odoo/{repo}. Skipping...\n"
                )
                continue

            # Add contributors
            body = body + "\n\n\n" + \
                ("\n").join([("Co-authored-by: " + contributor)
                             for contributor in CONTRIBUTORS])

            commit_title = odoo_commit_title(rel_path, version)
            message = commit_message(commit_title, body)
            checkout(repo_path, o_branch)
            # build & cp build
            run_build(config)
            copy_build(config, lib_file_name, full_path, stylesheet)
            # commit
            git("commit", "--no-verify", "-am", message)

        # apply the odoo/enterprise changes related to the released o-spreadsheet PRs
        missing = {}
        if version == "master":
            pr_numbers = get_pr_numbers(config, odoo_hash, spreadsheet_hash)
            missing = find_missing_commits(config, o_branch, version, pr_numbers)
        if missing:
            print_missing_commits(missing, o_branch)
            remaining_versions = versions[versions.index(version) + 1:]
            hint = "\n".join([
                f"Then push {o_branch} on the dev remote of {', '.join(dict.fromkeys([repo, *missing]))} and create the PR(s).",
                f"PRs to close manually once merged: {' '.join(get_open_pr_urls(missing))}",
                *([f"Versions not processed yet: {' '.join(remaining_versions)}"] if remaining_versions else []),
            ])
            apply_missing_commits(config, missing, o_branch, version, hint)
            prs_to_close.extend([version, url] for url in get_open_pr_urls(missing))

        # push & make Pr(s)
        for target_repo in dict.fromkeys([repo, *missing]):
            target_path = config[target_repo]["repo_path"]
            with pushd(target_path):
                git("push", "-u", config[target_repo]["remote-dev"], o_branch)
            if target_repo == repo:
                pr_title, pr_body = commit_title, body
            else:
                pr_title, pr_body = enterprise_adapt_title(version), ""
            url = make_PR(target_path, version, rebase_method="rebase-merge", title=pr_title, body=pr_body)
            new_prs.append([f"{version} ({target_repo})", url])

    # print All PR's, split between new and old
    if old_prs:
        print("\nAlready existing PRs:")
        print(
            "\n".join([f"\t{version} - <{url}>" for [version, url] in old_prs]))
    if new_prs:
        print("\nNewly created PRs:")
        print(
            "\n".join([f"\t{version} - <{url}>" for [version, url] in new_prs]))
        print(
            f"Runbot builds: <https://runbot.odoo.com/?search=spreadsheet-{d}-{h}-BI>")
    if prs_to_close:
        print_msg("\nPRs included in the update, to close manually once merged:", "WARNING")
        print(
            "\n".join([f"\t{version} - <{url}>" for [version, url] in prs_to_close]))
    if not (old_prs or new_prs):
        print("Every versions are up-to-date")

    return True
