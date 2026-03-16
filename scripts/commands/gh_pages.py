# Will build o_spreadsheet on master and copy the js, css and xml files to the gh-pages branch
import os
import configparser
import subprocess

from helpers import run_build, checkout, commit_message
from utils import pushd


def gh_pages(config: configparser.ConfigParser):
    spreadsheet_path = config["spreadsheet"]["repo_path"]
    to_copy = {
        "o_spreadsheet.iife.js": "o_spreadsheet.js",
        "o_spreadsheet.xml": "o_spreadsheet.xml",
        "o_spreadsheet.css": "o_spreadsheet.css",
    }
    files = {}
    with pushd(spreadsheet_path):

        checkout(spreadsheet_path, "master")
        last_commit_hash = subprocess.check_output(["git", "rev-parse", "HEAD"]).decode(
            "utf-8"
        )
        run_build(config)
        with pushd(os.path.join(config["spreadsheet"]["repo_path"], "build")):
            for fr, to in to_copy.items():
                if os.path.isfile(fr):
                    with open(fr, "r") as f:
                        files[to] = f.read()

        checkout(spreadsheet_path, "gh-pages")
        for file in files:
            with open(file, "w") as f:
                f.write(files[file])

        message = commit_message(
            f"Bump to {last_commit_hash[:6]}",
            f"bump to commit odoo/o-spreadsheet@{last_commit_hash}",
        )
        subprocess.check_output(["git", "commit", "-am", message])
