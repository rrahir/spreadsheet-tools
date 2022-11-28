# Make a release commit on o-spreadsheet versions
# This will be handled by a Github action to automatically publish the release on npm

import os
import re
import json
import configparser
import subprocess
from datetime import date
from uuid import uuid4
from helpers import (
    checkout,
    get_commits,
    copy_build,
    fetch_repositories,
    get_o_spreadsheet_release_prs,
    make_PR,
    reset,
    run_build,
    spreadsheet_release_title,
)
from utils import pushd, get_o_spreadsheet_hash
from shared import spreadsheet_odoo_versions


def release(config: configparser.ConfigParser):
    # todo
    print("\n=== RELEASE O-SPREADSHEET ===\nThis may take a while ;-)\n")
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    fetch_repositories(config)
    old_prs = []
    new_prs = []
    existing_prs = get_o_spreadsheet_release_prs(config)
    today = date.today()
    d = f"{str(today.day).zfill(2)}{str(today.month).zfill(2)}"
    h = str(uuid4())[:4]
    for [repo, version, rel_path] in spreadsheet_odoo_versions.values():
        text = f"Processing version {version}"
        print(text)
        print("=" * len(text))
        if version in existing_prs:
            print(
                f"Branch {version} already has a pending release PR on odoo/o-spreadsheet. Skipping..."
            )
            old_prs.append([version, existing_prs[version]])
            continue

        repo_path = config[repo]["repo_path"]
        full_path = os.path.join(repo_path, rel_path)

        # checkout o-spreadsheet
        checkout(spreadsheet_path, version, force=True)
        reset(spreadsheet_path, version)

        # checkout Odoo  on update branch
        checkout(repo_path, version, force=True)
        reset(repo_path, version)

        # build commit message - build/cp dist - push on remote
        with pushd(spreadsheet_path):
            full_file_path = os.path.join(full_path, "o_spreadsheet.js")
            hash = get_o_spreadsheet_hash(full_file_path)
            body = get_commits(
                spreadsheet_path,
                hash,
                version,
            )
            if not body:
                print(
                    f"Branch {version} is up-to-date on odoo/{repo}. Skipping..."
                )
                continue

            # magic happens
            with open("./package.json", "r") as f:
                package = json.loads(f.read())
                current_version = package["version"]
                splits = current_version.split(".")
                minor = splits.pop()
                major = ".".join(splits)
                tag = f"{major}.{int(minor) + 1}"

            import ipdb

            ipdb.set_trace()
            with open("./package.json", "r") as f:
                lines = f.readlines()

            with open("./package.json", "w") as f:
                for line in lines:
                    f.write(re.sub(current_version, tag, line))

            message = f"{spreadsheet_release_title(tag)}{body}"

            # commit
            o_branch = f"{tag}-release-{d}-{h}-BI"
            subprocess.check_output(["git", "commit", "-am", message])

            cmd = [
                "git",
                "push",
                "-u",
                config["spreadsheet"]["remote"],
                o_branch,
            ]
            subprocess.check_output(cmd)

        # make Pr
        url = make_PR(spreadsheet_path, version)
        new_prs.append([version, url])

    # print All PR's, split between new and old
    if old_prs:
        print("\nAlready existing PRs:")
        print("\n".join([f"\t{version} - {url}" for [version, url] in old_prs]))
    if new_prs:
        print("\nNewly created PRs:")
        print("\n".join([f"\t{version} - {url}" for [version, url] in new_prs]))
    if not (old_prs or new_prs):
        print("Every versions are up-to-date")

    return True
