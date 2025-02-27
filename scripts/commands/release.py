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
    fetch_repositories,
    get_o_spreadsheet_release_prs,
    make_PR,
    reset,
    spreadsheet_release_title,
    commit_message,
    print_msg,
    check_remote_alignment
)
from utils import pushd


def release(config: configparser.ConfigParser, versions: list[str]):
    check_remote_alignment()
    # todo
    print("\n=== RELEASE O-SPREADSHEET ===\nThis may take a while ;-)\n")
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    fetch_repositories(config, versions, True)
    old_prs = []
    new_prs = []
    existing_prs = get_o_spreadsheet_release_prs(config)
    today = date.today()
    d = f"{str(today.day).zfill(2)}{str(today.month).zfill(2)}"
    h = str(uuid4())[:4]

    for version in versions:
        text = f"Processing version {version}"
        print(text)
        print("=" * len(text))
        if version in existing_prs:
            print(
                f"Branch {version} already has a pending release PR on odoo/o-spreadsheet. Skipping...\n"
            )
            old_prs.append([version, existing_prs[version]])
            continue

        # checkout o-spreadsheet
        checkout(spreadsheet_path, version, force=True)
        reset(spreadsheet_path, version)

        # build commit message - build/cp dist - push on remote
        with pushd(spreadsheet_path):
            cmd = [
                "git",
                "log",
                "--pretty=format:%h",
                "-n",
                "1",
                "--grep",
                "\\[REL\\]",
            ]

            hash = subprocess.check_output(cmd).decode("utf-8")
            body = get_commits(spreadsheet_path,hash,version)
            
            if not body:
                print_msg(
                    f"No new commits for version {version}. Skipping release...\n", "WARNING"
                )
                continue

            tag = increment_package_version(spreadsheet_path, version)
            message = commit_message(spreadsheet_release_title(tag), body + "\n\nTask: 0")

            # commit
            release_branch = f"{tag}-release-{d}-{h}-BI"

            subprocess.check_output(["git", "checkout", "-b", release_branch])
            subprocess.check_output(["git", "commit", "-am", message])

            cmd = [
                "git",
                "push",
                "-u",
                config["spreadsheet"]["remote"],
                release_branch,
            ]
            subprocess.check_output(cmd)

        # make Pr
        url = make_PR(spreadsheet_path, version, auto=True)
        new_prs.append([version, url])

    # print All PR's, split between new and old
    if old_prs:
        print("\nAlready existing PRs:")
        print(
            "\n".join([f"\t{version} - <{url}>" for [version, url] in old_prs]))
    if new_prs:
        print("\nNewly created PRs:")
        print(
            "\n".join([f"\t{version} - <{url}>" for [version, url] in new_prs]))
    if not (old_prs or new_prs):
        print("Every versions are up-to-date")

    return True


def increment_package_version(path, branch_version):
    package_path = os.path.join(path, "package.json")
    with open(package_path, "r") as f:
        package = json.loads(f.read())
        package_version = package["version"]
        # version in the form "major.minor.patch" or "major.minor.0-alpha.patch"
        if branch_version != "master":
            package_version = re.sub(r"0-alpha.\d", "0", package_version)
        splits = package_version.split(".")
        patch = splits.pop()
        major = ".".join(splits)
        if branch_version == "master" and not major.endswith("-alpha"):
            major += "-alpha"

        tag = f"{major}.{int(patch) + 1}"

    with open(package_path, "r+") as f:
        pkg_dump = f.read()

    with open(package_path, "w") as f:
        f.write(re.sub(package_version, tag, pkg_dump))

    # Install required to update package-lock.json
    subprocess.check_output(["npm", "i"])

    return tag
