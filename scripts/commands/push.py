import configparser
import subprocess
import os
import sys

from helpers import commit_message, checkout, run_dist, copy_dist
from utils import pushd
from shared import get_spreadsheet_branch, get_version_info


def push(config: configparser.ConfigParser, local=False):
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
    [repo, version, rel_path] = get_version_info(spreadsheet_branch)
    repo_path = config[repo]["repo_path"]

    full_path = os.path.join(repo_path, rel_path)
    message = commit_message(
        spreadsheet_path, version, spreadsheet_branch, rel_path, version
    )
    if not message:
        sys.exit(
            f"The branch ${spreadsheet_branch} does not contain any new commits."
        )
    checkout(repo_path, spreadsheet_branch)
    run_dist(config)
    copy_dist(config, full_path)
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

    if repo == "odoo" and not local:
        # create an enterprise branch on remote for runbot builds
        ent_path = config["enterprise"]["repo_path"]
        with pushd(ent_path):
            checkout(ent_path, spreadsheet_branch)
            cmd = [
                "git",
                "push",
                "-u",
                config["enterprise"]["remote-dev"],
                spreadsheet_branch,
            ]
            subprocess.check_output(cmd)
