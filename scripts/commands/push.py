import configparser
import subprocess
import os
import sys

from helpers import (
    get_commits,
    checkout,
    run_build,
    copy_build,
    odoo_commit_title,
    commit_message
)
from utils import pushd
from shared import get_spreadsheet_branch, get_version_info


def push(config: configparser.ConfigParser, local=False, forceBuild=False):
    print("\n=== PUSH ===\n")
    spreadsheet_path = config["spreadsheet"]["repo_path"]

    with pushd(spreadsheet_path):
        # TODORAR check that head is up-to-date w/ remote as well
        if subprocess.check_output(["git", "diff"]):
            val = input(
                "You have unstaged changes, do you wish to continue without commiting them ? [y/n] : "
            )
            if val.lower() not in ["y", "yes"]:
                print("Exiting the script...")
                exit(1)
    spreadsheet_branch = get_spreadsheet_branch(config)
    [repo, version, rel_path, lib_file_name, with_css] = get_version_info(
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
        rel_path, version) or "wip o-spreadsheet lib update"
    message = commit_message(title, body)
    checkout(repo_path, spreadsheet_branch)
    run_build(config)
    copy_build(config, lib_file_name, full_path, with_css)
    with pushd(repo_path):
        subprocess.check_output(["git", "commit", "-am", message])
        if not local:
            cmd = [
                "git",
                "push",
                "-u",
                config[repo]["remote-dev"],
                spreadsheet_branch,
            ]
            subprocess.check_output(cmd)
