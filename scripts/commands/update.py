import configparser
import subprocess
import os
from datetime import date
from uuid import uuid4
from shared import spreadsheet_odoo_versions
from utils import pushd, get_o_spreadsheet_hash
from helpers import (
    get_existing_prs,
    checkout,
    reset,
    commit_message,
    run_dist,
    copy_dist,
    make_PR,
)


def update(config: configparser.ConfigParser):
    print("\n=== UPDATE ===\nThis may take a while ;-)\n")
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    ent_path = config["enterprise"]["repo_path"]
    versions = [k for k in spreadsheet_odoo_versions.keys()]

    print("fetching o-spreadsheet ...")
    with pushd(spreadsheet_path):
        subprocess.check_output(
            [
                "git",
                "fetch",
                config["spreadsheet"]["remote"],
            ]
            + versions
        )
    print("fetching enterprise ...")
    with pushd(config["enterprise"]["repo_path"]):
        subprocess.check_output(
            ["git", "fetch", config["enterprise"]["remote"]] + versions
        )
    print("fetching odoo ...")
    with pushd(config["odoo"]["repo_path"]):
        subprocess.check_output(
            ["git", "fetch", config["odoo"]["remote"]] + versions
        )
    old_prs = []
    new_prs = []
    existing_prs = get_existing_prs(config)
    today = date.today()
    d = f"{str(today.day).zfill(2)}{str(today.month).zfill(2)}"
    h = str(uuid4())[:4]
    for [repo, version, rel_path] in spreadsheet_odoo_versions.values():
        text = f"Processing version {version}"
        print(text)
        print("=" * len(text))
        if version in existing_prs:
            print(
                f"Branch {version} already has a pending PR on odoo/{repo}. Skipping..."
            )
            old_prs.append([version, existing_prs[version]])
            continue

        repo_path = config[repo]["repo_path"]
        full_path = os.path.join(repo_path, rel_path)
        o_branch = f"{version}-spreadsheet-{d}-{h}-BI"
        # checkout o-spreadsheet
        checkout(spreadsheet_path, version)
        reset(spreadsheet_path, version)
        # checkout Odoo  on update branch
        checkout(repo_path, version, force=True)
        reset(repo_path, version)
        # build commit message - build/cp dist - push on remote
        with pushd(repo_path):
            full_file_path = os.path.join(full_path, "o_spreadsheet.js")
            hash = get_o_spreadsheet_hash(full_file_path)
            message = commit_message(
                spreadsheet_path, hash, version, rel_path, version
            )
            if not message:
                print(
                    f"Branch {version} is up-to-date on odoo/{repo}. Skipping..."
                )
                continue
            checkout(repo_path, o_branch)
            # build & cp dist
            run_dist(config)
            copy_dist(config, full_path)
            # commit
            subprocess.check_output(["git", "commit", "-am", message])
            cmd = [
                "git",
                "push",
                "-u",
                config[repo]["remote-dev"],
                o_branch,
            ]
            subprocess.check_output(cmd)

        if repo == "odoo":
            # create an enterprise branch for runbot builds
            ent_path = config["enterprise"]["repo_path"]
            with pushd(ent_path):
                checkout(ent_path, o_branch)
                cmd = [
                    "git",
                    "push",
                    "-u",
                    config["enterprise"]["remote-dev"],
                    o_branch,
                ]
                subprocess.check_output(cmd)

        # make Pr
        url = make_PR(repo_path, version)
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
