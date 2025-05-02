import subprocess
import configparser
import sys
import os
import shutil
import pprint
import json
import pathlib

from shared import spreadsheet_odoo_versions
from const import DIFF_VALID_PATH
from utils import pushd, retry_cmd
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
            [_, version, _, _, _] = get_version_info(branch)
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


def get_odoo_prs(config: configparser.ConfigParser):
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
                ).decode("utf-8")
                if existing_prs:
                    url = "https://github.com/odoo/%s/pull/%s" % (
                        repo,
                        existing_prs.split("\t")[0],
                    )
                    prs[version] = url
    return prs


def get_o_spreadsheet_release_prs(config: configparser.ConfigParser):
    prs = {}
    path = config["spreadsheet"]["repo_path"]
    with pushd(path):
        for version in spreadsheet_odoo_versions.keys():
            existing_prs = subprocess.check_output(
                [
                    "gh",
                    "pr",
                    "list",
                    "--search",
                    f"base:{version} is:open [REL]in:title",
                ]
            ).decode("utf-8")
            if existing_prs:
                url = "https://github.com/odoo/o-spreadsheet/pull/%s" % (
                    existing_prs.split("\t")[0],
                )
                prs[version] = url
    return prs


def get_commits(path, old, new):
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
            "--pretty=format:https://github.com/odoo/o-spreadsheet/commit/%h %s [%(trailers:key=Task,separator=%20)](https://www.odoo.com/odoo/2328/tasks/%(trailers:key=Task,separator=%20,valueonly))",
        ]

        commits = subprocess.check_output(cmd).decode("utf-8")
        if not commits:
            return ""
        return f"### Contains the following commits:\n\n{commits}"


def spreadsheet_release_title(tag):
    return f"[REL] {tag}"


def odoo_commit_title(rel_path, version="master"):
    spitted_path = rel_path.split("/")
    addon_name = (
        spitted_path[1] if spitted_path[0] == "addons" else spitted_path[0]
    )
    title = "{} {}: update o_spreadsheet to latest version".format(
        version == "master" and "[IMP]" or "[FIX]", addon_name
    )
    return title


def enterprise_commit_title(spreadsheet_path, odoo_version="master"):
    # returns a commit title based o nthe new o_spreadshet package version
    with pushd(spreadsheet_path):
        with open("package.json") as f:
            package_version = json.load(f)["version"]

    return "{} *_spreadsheet_*: Update o_spreadsheet library to version {}".format(
        odoo_version == "master" and "[IMP]" or "[FIX]", package_version
    )


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
            print_msg(
                "You might be running a bad version of npm packages. Please run 'npm install' and retry :)", "WARNING"
            )
            exit(1)


def run_build(config: configparser.ConfigParser):
    with pushd(config["spreadsheet"]["repo_path"]):
        print("Compiling build...")
        try:
            # cleans previous dist
            if os.path.isdir("build"):
                shutil.rmtree("build")
            subprocess.check_output(["npm", "run", "build"])
        except Exception as e:
            pp.pprint(e.cmd)
            pp.pprint(e.returncode)
            print_msg(
                "You might be running a bad version of npm packages. Please run 'npm install' and retry :)", "WARNING")
            exit(1)


def copy_build(config: configparser.ConfigParser, lib_file_name: str, destination_path: str, with_css: bool):
    with pushd(os.path.join(config["spreadsheet"]["repo_path"], "build")):
        print("Copying build...")
        # find files
        files = [lib_file_name, "o_spreadsheet.xml"]
        if (with_css):
            files.append("o_spreadsheet_variables.scss")
            files.append("o_spreadsheet.scss")
        for file in files:
            if os.path.isfile(file):
                shutil.copy(file, destination_path)
        shutil.move(f"{destination_path}/{lib_file_name}",
                    f"{destination_path}/o_spreadsheet.js")


def make_PR(path, version, **kwargs) -> str:
    stop = kwargs.get("stop", True)
    # this can only be used with proper clearance
    autoCommit = kwargs.get("auto", False)
    print("making PR", version, path)
    with pushd(path):
        subprocess.check_output(
            ["gh", "pr", "create", "--fill", "--base", version]
        )
        result = retry_cmd(["gh", "pr", "view", "--json", "url"], 3)
        url = json.loads(result.decode("utf-8"))["url"]

        if stop:
            retry_cmd(
                ["gh", "pr", "comment", url, "--body", "robodoo fw=no"], 3
            )
        if autoCommit:
            retry_cmd(
                ["gh", "pr", "comment", url, "--body", "robodoo r+"], 3
            )
        return url


def fetch_repositories(config, versions, spreadsheet_only=False):
    spreadsheet_path = config["spreadsheet"]["repo_path"]

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
    if spreadsheet_only:
        return
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


bcolors = {
    "HEADER": '\033[95m',
    "OKBLUE": '\033[94m',
    "OKCYAN": '\033[96m',
    "OKGREEN": '\033[92m',
    "WARNING": '\033[93m',
    "FAIL": '\033[91m',
    "ENDC": '\033[0m',
    "BOLD": '\033[1m',
    "UNDERLINE": '\033[4m',
}


def print_msg(text: str, level=False):
    if level:
        print(bcolors[level] + text + bcolors["ENDC"])
    else:
        print(text)


def commit_message(title: str, body: str) -> str:
    return f"{title}\n\n{body}"


def check_remote_alignment():
    root_dir = pathlib.Path(__file__).parent.parent
    
    with pushd(root_dir):
        subprocess.check_output(["git", "remote", "update"])
        ###
        # Check if the current branch was rebased on the remote master
        ###
        branch_name = subprocess.check_output(
            [
                "git", "branch",
                subprocess.check_output(["git", "symbolic-ref", "--short", "HEAD"], text=True).strip(), # current branch name 
                "--contains",
                subprocess.check_output(["git", "rev-parse", "refs/heads/master"], text=True).strip() # remote master HEAD
            ],
            text=True
        ).strip()
        if (not branch_name):
            print_msg("Your local branch is not aligned with the remote branch master. Please pull the remote branch before continuing", "FAIL")
            exit(1)
