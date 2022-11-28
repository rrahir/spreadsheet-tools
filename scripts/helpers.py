import subprocess
import configparser
import sys
import os
import shutil
import pprint
import json

from shared import spreadsheet_odoo_versions
from const import DIFF_VALID_PATH
from utils import pushd
from shared import get_version_info, get_verbose


pp = pprint.PrettyPrinter(depth=30)


def checkout(exec_path, branch, force=False):
    is_verbose = get_verbose()
    with pushd(exec_path):
        try:
            lingering_diff = subprocess.check_output(["git", "diff"]).decode(
                "utf-8"
            )
            if lingering_diff:
                if force:
                    subprocess.check_output(
                        ["git", "reset", "--hard", "HEAD"]
                    ).decode("utf-8")
                else:
                    sys.exit(
                        f"You have unstaged changes. Please fix it\nPath:\n{exec_path}\n\n{lingering_diff}"
                    )
            subprocess.check_output(["git", "checkout", branch])
        except subprocess.CalledProcessError as e:
            [_, version, _] = get_version_info(branch)
            is_verbose and print(
                "Branch not found.\nCreating new local branch..."
            )
            is_verbose and print(f"Checkout base branch {version}")
            subprocess.check_output(["git", "checkout", version])
            # resets base on remote commit
            # TODORAR smarter fetch. checkout should work with config, not an exec path, imho
            subprocess.check_output(["git", "pull"])
            is_verbose and print(f"Create branch {branch}")
            subprocess.check_output(["git", "checkout", "-b", branch])


def reset(exec_path, branch):
    with pushd(exec_path):
        remote_branch = (
            subprocess.check_output(
                [
                    "git",
                    "rev-parse",
                    "--abbrev-ref",
                    "--symbolic-full-name",
                    "@{u}",
                ]
            )
            .decode("utf-8")
            .rstrip("\n")
        )
        get_verbose() and print(f"resetting {branch} on {remote_branch} ...")
        subprocess.check_output(["git", "reset", "--hard", remote_branch])


def get_existing_prs(config: configparser.ConfigParser):
    prs = {}
    for repo in ["enterprise", "odoo"]:
        path = config[repo]["repo_path"]
        with pushd(path):
            for version in spreadsheet_odoo_versions.keys():
                existing_prs = subprocess.check_output(
                    [
                        "gh",
                        "pr",
                        "list",
                        "--search",
                        f"base:{version} is:open update o_spreadsheet to latest version",
                    ]
                )
                if existing_prs:
                    url = "https://github.com/odoo/%s/pull/%s" % (
                        repo,
                        existing_prs.decode("utf-8").split("\t")[0],
                    )
                    prs[version] = url
    return prs


def commit_message(path, old, new, rel_path, version="master"):
    with pushd(path):
        cmd = ["git", "diff", "--name-only", old, new]
        diff_file_paths = (
            subprocess.check_output(cmd).decode("utf-8").split("\n")
        )
        diff_files = any(
            [
                any([file_path.startswith(path) for path in DIFF_VALID_PATH])
                for file_path in diff_file_paths
            ]
        )
        if not diff_files:
            return ""
        cmd = [
            "git",
            "log",
            f"{old}..{new}",
            "--pretty=format:https://github.com/odoo/o-spreadsheet/commit/%h %s",
        ]
        commits = subprocess.check_output(cmd).decode("utf-8")
        if not commits:
            return ""
        spitted_path = rel_path.split("/")
        addon_name = (
            spitted_path[1] if spitted_path[0] == "addons" else spitted_path[0]
        )
        title = "{} {}: update o_spreadsheet to latest version".format(
            version == "master" and "[IMP]" or "[FIX]", addon_name
        )
        return f"{title}\n\n### Contains the following commits:\n\n{commits}"


def run_dist(config: configparser.ConfigParser):
    with pushd(config["spreadsheet"]["repo_path"]):
        print("Compiling dist...")
        try:
            # cleans previous dist
            if os.path.isdir("dist"):
                shutil.rmtree("dist")
            subprocess.check_output(["npm", "run", "dist"])
        except Exception as e:
            pp.pprint(e.cmd)
            pp.pprint(e.returncode)
            print(
                "You might be running a bad version of npm packages. Please run 'npm install' and retry :)"
            )
            exit(1)


def copy_dist(config: configparser.ConfigParser, destination_path: str):
    with pushd(os.path.join(config["spreadsheet"]["repo_path"], "dist")):
        print("Copying dist...")
        # find files
        for file in ["o_spreadsheet.js", "o_spreadsheet.xml"]:
            if os.path.isfile(file):
                shutil.copy(file, destination_path)


def make_PR(path, version, stop=True):
    print("making PR", version, path)
    with pushd(path):
        result = subprocess.check_output(
            ["gh", "pr", "create", "--fill", "--base", version]
        )
        age = "new"
        # TODO: make retry step
        result = subprocess.check_output(["gh", "pr", "view", "--json", "url"])
        url = json.loads(result.decode("utf-8"))["url"]

        if stop:
            subprocess.check_output(
                ["gh", "pr", "comment", url, "--body", "fw-bot ignore"]
            )
        return [age, url]
