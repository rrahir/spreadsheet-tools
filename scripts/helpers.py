import configparser
import json
import os
import pathlib
import pprint
import re
import shutil
import subprocess
import sys
import time

from const import DIFF_VALID_PATH
from shared import get_verbose, get_version_info, spreadsheet_odoo_versions
from utils import pushd, retry_cmd

pp = pprint.PrettyPrinter(depth=30)


def git(*args) -> str:
    return subprocess.check_output(["git", *args]).decode("utf-8").strip()


def checkout(exec_path, branch, force=False):
    is_verbose = get_verbose()
    with pushd(exec_path):
        try:
            lingering_diff = git("diff")
            if lingering_diff:
                if force:
                    git("reset", "--hard", "HEAD")
                else:
                    print_msg("You have unstaged changes. Please fix it", "FAIL")
                    print_msg(f"Path:\n{exec_path}\n\n{lingering_diff}\n")
                    print_msg("You have unstaged changes. Please fix it!", "FAIL")
                    sys.exit(1)
            git("checkout", branch)
        except subprocess.CalledProcessError as e:
            version = get_version_info(branch).version
            is_verbose and print(
                "Branch not found.\nCreating new local branch..."
            )
            is_verbose and print(f"Checkout base branch {version}")
            git("checkout", version)
            # resets base on remote commit
            # TODORAR smarter fetch. checkout should work with config, not an exec path, imho
            git("pull")
            is_verbose and print(f"Create branch {branch}")
            git("checkout", "-b", branch)


def reset(exec_path, branch):
    with pushd(exec_path):
        remote_branch = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
        get_verbose() and print(f"resetting {branch} on {remote_branch} ...")
        git("reset", "--hard", remote_branch)


def get_odoo_prs(config: configparser.ConfigParser):
    prs = {}
    for repo in ["enterprise", "odoo"]:
        path = config[repo]["repo_path"]
        with pushd(path):
            for version in spreadsheet_odoo_versions:
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
                    url = "https://github.com/odoo/{}/pull/{}".format(
                        repo,
                        existing_prs.split("\t")[0],
                    )
                    prs[version] = url
    return prs


def get_o_spreadsheet_release_prs(config: configparser.ConfigParser):
    prs = {}
    path = config["spreadsheet"]["repo_path"]
    with pushd(path):
        for version in spreadsheet_odoo_versions:
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
                url = "https://github.com/odoo/o-spreadsheet/pull/{}".format(
                    existing_prs.split("\t")[0],
                )
                prs[version] = url
    return prs


def get_commits(path, old, new):
    with pushd(path):
        diff_file_paths = git("diff", "--name-only", old, new).split("\n")
        diff_files = any(
            any(file_path.startswith(path) for path in DIFF_VALID_PATH)
                for file_path in diff_file_paths
        )
        if not diff_files:
            return ""
        commits = git(
            "log",
            f"{old}..{new}",
            "--pretty=format:https://github.com/odoo/o-spreadsheet/commit/%h %s [%(trailers:key=Task,separator=%20)](https://www.odoo.com/odoo/2328/tasks/%(trailers:key=Task,separator=%20,valueonly))",
        )
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


def enterprise_adapt_title(version="master"):
    # title of the enterprise PR applying the changes related to an o-spreadsheet update
    return "{} *_spreadsheet_*: adapt to o-spreadsheet update".format(
        version == "master" and "[IMP]" or "[FIX]"
    )


def enterprise_commit_title(spreadsheet_path, odoo_version="master"):
    # returns a commit title based o nthe new o_spreadshet package version
    with pushd(spreadsheet_path), open("package.json") as f:
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


def copy_build(config: configparser.ConfigParser, lib_file_name: str, destination_path: str, stylesheet: str = "NO", copy_types: bool = False):
    if stylesheet not in ["NO", "SCSS", "CSS"]:
        print_msg("Wrong stylesheet option", "FAIL")
        exit(1)
    with pushd(os.path.join(config["spreadsheet"]["repo_path"], "build")):
        print("Copying build...")
        # find files
        files = [lib_file_name, "o_spreadsheet.xml"]
        if (stylesheet == "SCSS"):
            files.append("o_spreadsheet_variables.scss")
            files.append("o_spreadsheet.scss")
        if (stylesheet == "CSS"):
            files.append("o_spreadsheet.css")
        if copy_types:
            if not os.path.isfile("o_spreadsheet.d.ts"):
                print_msg("Types file o_spreadsheet.d.ts not found in the build", "WARNING")
            files.append("o_spreadsheet.d.ts")
        for file in files:
            if os.path.isfile(file):
                shutil.copy(file, destination_path)
        shutil.move(f"{destination_path}/{lib_file_name}",
                    f"{destination_path}/o_spreadsheet.js")
        if lib_file_name.endswith(".esm.js"):
            transpile_esm_to_odoo_define(f"{destination_path}/o_spreadsheet.js")

def run_benchmark():
    root_path = os.path.split(os.path.dirname(os.path.abspath(__file__)))[0]
    with pushd(os.path.join(root_path, "benchmark")):
        try:
            # TODO un jour faire un truc propre pour printer en étape
            result = subprocess.check_output(["node",  "--expose-gc", "start", "benchmark_worker.js"]).decode(
                "utf-8"
            )
        except Exception as e:
            pp.pprint(e.cmd)
            pp.pprint(e.returncode)
            exit(1)
        print(result)

def transpile_esm_to_odoo_define(path):
    with open(path, "r") as f:
        content = f.read()

    content = convert_owl_imports(content)
    content = convert_object_export(content)
    index = content.index("*/")+2
    content = LEADING_COMMENTS + "\n" + content[:index] + ODOO_DEFINE_OPEN + content[index:] + ODOO_DEFINE_CLOSE

    with open(path, "w") as f:
        f.write(content)

LEADING_COMMENTS ="""// @odoo-module ignore
// Transpiled AOT with https://github.com/rrahir/spreadsheet-tools"""

ODOO_DEFINE_OPEN = """
odoo.define('@spreadsheet/o_spreadsheet/o_spreadsheet', ['@odoo/owl'], function (require) {
'use strict';
let __exports = {};"""

ODOO_DEFINE_CLOSE = "\nreturn __exports;\n});\n"


EXPORT_OBJECT_RE = re.compile(r"""
    export\s*                           # export
    (?P<object>{[\w$\s,]+})             # { a, b, c as x, ... }
    """, re.MULTILINE | re.VERBOSE)


def convert_object_export(content):
    """
    // before
    export { a, b, c as x }
    // after
    Object.assign(__exports, { a, b, x: c })
    """
    def repl(matchobj):
        object_process = "{" + ",".join([convert_as(val) for val in matchobj["object"][1:-1].split(",")]) + "}"
        return f"Object.assign(__exports, {object_process})"
    return EXPORT_OBJECT_RE.sub(repl, content)

def convert_owl_imports(content):
    """
    // before
    import { Component, useState } from '@odoo/owl';
    import * as owl from '@odoo/owl';
    // after
    const { Component, useState } = require('@odoo/owl');
    const owl = require('@odoo/owl');
    """
    content = re.sub(
        r'import {([^}]+)} from ["\']@odoo/owl["\'];',
        r"const {\1} = require('@odoo/owl');",
        content,
    )
    content = re.sub(
        r"import \* as (\w+) from [\"']@odoo/owl[\"'];",
        r"const \1 = require('@odoo/owl');",
        content,
    )
    return content

def convert_as(val):
    parts = val.split(" as ")
    return val if len(parts) < 2 else "{}: {}".format(*tuple(reversed(parts)))


def get_current_branch_pr_url():
    result = subprocess.run(
        ["gh", "pr", "view", "--json", "url"], capture_output=True, text=True
    )
    return json.loads(result.stdout)["url"] if result.returncode == 0 else None


def make_PR(path, version, **kwargs) -> str:
    stop = kwargs.get("stop", True)
    # this can only be used with proper clearance
    autoCommit = kwargs.get("auto", False)
    rebase_method = kwargs.get("rebase_method", False)
    # PR title/body, defaults on the commits (gh --fill)
    title = kwargs.get("title")
    body = kwargs.get("body", "")
    # number of attempts for each gh call
    retry = kwargs.get("retry", 3)

    if rebase_method and rebase_method not in ["rebase-ff", "rebase-merge", "squash"]:
        raise Exception("Wrong rebase value")
    
    print("making PR", version, path)
    with pushd(path):
        content = ["--title", title, "--body", body] if title else ["--fill"]
        url = None
        for i in range(1, retry + 1):
            try:
                subprocess.check_output(
                    ["gh", "pr", "create", *content, "--base", version]
                )
                break
            except subprocess.CalledProcessError as e:
                # github can fail (e.g. 502) after having created the PR
                url = get_current_branch_pr_url()
                if url:
                    break
                if i == retry:
                    raise e
                print(f"call #{i} failed. Retrying ...")
                time.sleep(2)
        url = url or json.loads(retry_cmd(["gh", "pr", "view", "--json", "url"], retry).decode("utf-8"))["url"]

        msg = []
        if stop:
            msg.append("robodoo fw=no")
        if rebase_method:
            msg.append(f"robodoo {rebase_method}")
        if autoCommit:
            msg.append("robodoo r+")

        if len(msg) > 0:
            retry_cmd(
                ["gh", "pr", "comment", url, "--body", "\n".join(msg)], retry
            )

        return url


def fetch_repositories(config, versions, spreadsheet_only=False):
    spreadsheet_path = config["spreadsheet"]["repo_path"]

    print("fetching o-spreadsheet ...")
    with pushd(spreadsheet_path):
        git("fetch", config["spreadsheet"]["remote"], *versions)
    if spreadsheet_only:
        return
    print("fetching enterprise ...")
    with pushd(config["enterprise"]["repo_path"]):
        git("fetch", config["enterprise"]["remote"], *versions)
    print("fetching odoo ...")
    with pushd(config["odoo"]["repo_path"]):
        git("fetch", config["odoo"]["remote"], *versions)


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
        git("remote", "update")
        ###
        # Check if the current branch was rebased on the remote master
        ###

        remote_name = git("remote").splitlines()[0]  # assuming 'origin' is the first remote

        branch_name = git(
            "branch",
            "--contains",
            remote_name, # remote master HEAD hash
            "master"
        )
        if (not branch_name):
            print_msg("Your spreadsheet-tools branch is not up to date with the remote branch master. Please pull the remote branch before continuing", "FAIL")
            exit(1)
