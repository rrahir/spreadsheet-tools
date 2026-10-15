import configparser
import os
import sys

from helpers import (
    check_remote_alignment,
    checkout,
    commit_message,
    copy_build,
    get_commits,
    git,
    odoo_commit_title,
    run_build,
)
from shared import get_spreadsheet_branch, get_version_info
from utils import pushd

from .check_odoo_sync import warn_odoo_sync


def push(config: configparser.ConfigParser, local=False, forceBuild=False):
    check_remote_alignment()
    print("\n=== PUSH ===\n")
    spreadsheet_path = config["spreadsheet"]["repo_path"]

    with pushd(spreadsheet_path):
        # TODORAR check that head is up-to-date w/ remote as well
        if git("diff"):
            val = input(
                "You have unstaged changes, do you wish to continue without commiting them ? [y/n] : "
            )
            if val.lower() not in ["y", "yes"]:
                print("Exiting the script...")
                exit(1)
    warn_odoo_sync(config)
    spreadsheet_branch = get_spreadsheet_branch(config)
    [repo, version, rel_path, lib_file_name, stylesheet] = get_version_info(
        spreadsheet_branch)
    repo_path = config[repo]["repo_path"]

    full_path = os.path.join(repo_path, rel_path)
    body = get_commits(
        spreadsheet_path,
        version,
        spreadsheet_branch,
    )
    if not body:
        sys.exit(
            f"The branch {spreadsheet_branch} does not contain any new commits."
        )

    title = forceBuild and odoo_commit_title(
        rel_path, version) or "[IMP] o-spreadsheet: wip lib update"
    message = commit_message(title, body)
    checkout(repo_path, spreadsheet_branch)
    run_build(config)
    copy_build(config, lib_file_name, full_path, stylesheet)
    with pushd(repo_path):
        git("commit", "-am", message)
        if not local:
            git(
                "push",
                "--force-with-lease",
                "--force-if-includes",
                "-u",
                config[repo]["remote-dev"],
                spreadsheet_branch,
            )
