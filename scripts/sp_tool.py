#!/usr/bin/python3

# packages
import configparser
import json
import os
import re
import shutil
import sys
import pprint
import subprocess
from uuid import uuid4

from docopt import docopt
from datetime import date

# local imports
from shared import (get_spreadsheet_branch,
                    spreadsheet_odoo_versions,
                    get_version_info)

from utils import pushd

pp = pprint.PrettyPrinter(depth=30)

VERBOSE = True


def run_dist(config: configparser.ConfigParser):
    with pushd(config["spreadsheet"]["repo_path"]):
        print("Compiling dist...")
        try:
            # cleans previous dist
            shutil.rmtree("dist")
            subprocess.check_output(["npm", "run", "dist"])
        except Exception as e:
            pp.pprint(e.cmd)
            pp.pprint(e.returncode)
            print("You might be running a bad version of npm packages. Please run 'npm install' and retry :)")
            exit(1)


def copy_dist(config: configparser.ConfigParser, destination_path: str):
    with pushd(os.path.join(config["spreadsheet"]["repo_path"], "dist")):
        print("Copying dist...")
        # find files
        # TODO convert to shutils.copy
        subprocess.check_output(['cp', 'o_spreadsheet.js', destination_path])
        subprocess.check_output(['cp', 'o_spreadsheet.xml', destination_path])


def checkout(exec_path, branch, force=False):
    global VERBOSE
    with pushd(exec_path):
        try:
            lingering_diff = subprocess.check_output(['git', 'diff']).decode("utf-8")
            if (lingering_diff):
                if force:
                    subprocess.check_output(['git', 'reset', "--hard", "HEAD"]).decode("utf-8")
                else:
                    sys.exit(f"You have unstaged changes. Please fix it\nPath:\n{exec_path}\n\n{lingering_diff}")
            subprocess.check_output(['git', 'checkout', branch])
        except subprocess.CalledProcessError as e:
            [version, _] = get_version_info(branch)
            VERBOSE and print("Branch not found.\nCreating new local branch...")
            VERBOSE and print(f"Checkout base branch {version}")
            subprocess.check_output(['git', 'checkout', version])
            # resets base on remote commit
            subprocess.check_output(['git', 'pull'])
            VERBOSE and print(f"Create branch {branch}")
            subprocess.check_output(['git', 'checkout', '-b', branch])


def reset(exec_path, branch):
    global VERBOSE
    with pushd(exec_path):
        remote_branch = subprocess.check_output(
            ['git', 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).decode("utf-8").rstrip("\n")
        VERBOSE and print(f"resetting {branch} on {remote_branch} ...")
        subprocess.check_output(['git', 'reset', '--hard', remote_branch])


def make_PR(path, version, stop=True):
    print("making PR", version, path)
    with pushd(path):
        result = subprocess.check_output(
            ["gh", "pr", "create", "--fill", "--base", version])
        age = "new"
        result = subprocess.check_output(["gh", "pr", "view", "--json", "url"])
        url = json.loads(result.decode('utf-8'))['url']

        if stop:
            subprocess.check_output(
                ["gh", "pr", "comment", url, "--body", "fw-bot ignore"])
        return [age, url]


def commit_message(path, old, new, rel_path, version="master"):
    with pushd(path):
        cmd = ["git", "log", f"{old}..{new}", "--pretty=format:https://github.com/odoo/o-spreadsheet/commit/%h %s"]
        commits = subprocess.check_output(cmd).decode("utf-8")
        if (not commits):
            return ""
        title = "{} {}: update o_spreadsheet to latest version".format(
            version == "master" and "[IMP]" or "[FIX]", rel_path.split("/")[0])
        return f"{title}\n\n### Contains the following commits:\n\n{commits}"


def push(config: configparser.ConfigParser, local=False):
    print("\n=== PUSH ===\n")
    spreadsheet_path = config["spreadsheet"]['repo_path']
    ent_path = config["enterprise"]['repo_path']

    with pushd(spreadsheet_path):
        # TODORAR check that head is up-to-date w/ remote as well
        if subprocess.check_output(['git', 'diff']):
            val = input("You have unstaged changes, do you wish to continue without commiting them ? [y/n] : ")
            if val.lower() not in ['y', 'yes']:
                exit(1)
    spreadsheet_branch = get_spreadsheet_branch(config)
    [version, rel_path] = get_version_info(spreadsheet_branch)
    o_branch = f"{version}-spreadsheet{spreadsheet_branch.split(version)[-1]}"
    full_path = os.path.join(ent_path, rel_path)
    message = commit_message(spreadsheet_path, version, spreadsheet_branch, rel_path, version)
    if not message:
        sys.exit(f"The branch ${spreadsheet_branch} does not contain any new commits.")
    checkout(ent_path, o_branch)
    run_dist(config)
    copy_dist(config, full_path)
    with pushd(ent_path):
        subprocess.check_output(['git', 'commit', '-am', message])
        if not local:
            cmd = ["git", "push", "-u", config['enterprise']["remote-dev"], o_branch]
            subprocess.check_output(cmd)


def list_pr(config: configparser.ConfigParser):
    PRs = get_existing_prs(config)
    if PRs:
        print("\nPending Enterprise PRs:")
        print("\n".join([f"\t{version} - {url}" for [version, url] in PRs.items()]))
    else:
        print("\nThere are no open pull requests...")


def get_existing_prs(config: configparser.ConfigParser):
    ent_path = config["enterprise"]['repo_path']
    prs = {}
    with pushd(ent_path):
        for version in spreadsheet_odoo_versions.keys():
            existing_prs = subprocess.check_output(['gh', 'pr', 'list', '--search', f"base:{version} is:open update o_spreadsheet to latest version"])
            if existing_prs:
                url = "https://github.com/odoo/enterprise/pull/%s" % existing_prs.decode('utf-8').split('\t')[0]
                prs[version] = url
    return prs

def update(config: configparser.ConfigParser):
    print("\n=== UPDATE ===\nThis may take a while ;-)\n")
    spreadsheet_path = config["spreadsheet"]['repo_path']
    ent_path = config["enterprise"]['repo_path']
    print('fetching o-spreadsheet ...')
    with pushd(spreadsheet_path):
        subprocess.check_output(['git', 'fetch', config["spreadsheet"]['remote']])
    print('fetching enterprise ...')
    with pushd(config['enterprise']['repo_path']):
        subprocess.check_output(['git', 'fetch', config['enterprise']["remote"]])
    old_prs = []
    new_prs = []
    existing_prs = get_existing_prs(config)
    today = date.today()
    d = f"{str(today.day).zfill(2)}{str(today.month).zfill(2)}"
    h = str(uuid4())[:4]
    for [version, rel_path] in spreadsheet_odoo_versions.values():
        if version in existing_prs:
            print(f"Branch {version} already has a pending PR on odoo/enterprise. Skipping...")
            old_prs.append([version, existing_prs[version]])
            continue

        full_path = os.path.join(ent_path, rel_path)
        o_branch = f"{version}-spreadsheet-{d}-{h}-BI"
        # checkout o-spreadsheet
        checkout(spreadsheet_path, version)
        reset(spreadsheet_path, version)
        # checkout enterprise on update branch
        checkout(ent_path, version, force=True)
        reset(ent_path, version)
        # build commit message - build/cp dist - push on remote
        with pushd(ent_path):
            full_file_path = os.path.join(full_path, 'o_spreadsheet.js')
            # TODO export in function to support cross platform
            lines = subprocess.check_output(["tail", "-10", full_file_path]).decode("utf-8").split("\n")
            hash = [line for line in lines if "hash" in line][0][-9:-2]
            message = commit_message(spreadsheet_path, hash, version, rel_path, version)
            if not message:
                print(f"Branch {version} is up-to-date on odoo/enterprise. Skipping...")
                continue
            checkout(ent_path, o_branch)
            # build & cp dist
            run_dist(config)
            copy_dist(config, full_path)
            # commit
            subprocess.check_output(['git', 'commit', '-am', message])
            cmd = ["git", "push", "-u", config['enterprise']["remote-dev"], o_branch]
            subprocess.check_output(cmd)

        # make Pr
        url = make_PR(ent_path, version)
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


def main():
    """
Usage:
    sp_tool update [-s]
    sp_tool push [-l] [-s]
    sp_tool list-pr
    sp_tool process
    sp_tool (-h | --help | --version )
Options:
    -l      commit locally (don't push on remote)
    -s      silent mode (not yet implemented)

    """
    arguments = docopt(main.__doc__, version="0.0.1@alpha")
    from config import config

    if arguments["-s"]:
        global VERBOSE
        VERBOSE = False

    if arguments["list-pr"]:
        list_pr(config)
        exit(0)

    if arguments["update"]:
        update(config)
        exit(0)

    if arguments["push"]:
        spreadsheet_path = config["spreadsheet"]['repo_path']
        if not os.getcwd().startswith(spreadsheet_path):
            sys.exit(f"This command should be run from spreadsheet repository {spreadsheet_path}")
        push(config, arguments["-l"])
        exit(0)

    if arguments["process"]:
        # redirect user to doc in a .md
        print('PLease consult https://github.com/odoo/o-spreadsheet/14.0/tree/doc/workflow.md')
        exit(0)


if __name__ == '__main__':

    if os.getuid() == 0:
        sys.exit(
            """
===========================================================

 [bad habit] sp_tool cannot be run as root (ノಠ益ಠ)ノ彡┻━┻

===========================================================
""")

    main()
